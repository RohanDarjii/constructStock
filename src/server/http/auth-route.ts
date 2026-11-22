import "server-only";
import { z } from "zod";
import { getAuthEnv } from "@/server/config/env";
import { log, type LogContext } from "@/server/logging/logger";
import { AppError } from "@/shared/errors/app-error";
import { apiError, createRequestId } from "./api-response";

const maxBodyBytes = 8192;

function diagnosticLabel(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isSafeInteger(value)) return String(value);
  return typeof value === "string" && /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(value) ? value : undefined;
}

/** Keep exception types, driver codes, and local call sites; never log error messages. */
function errorDiagnostics(error: unknown): Pick<LogContext, "exceptionType" | "exceptionCode" | "causeType" | "causeCode" | "stackFrames"> {
  if (!(error instanceof Error)) return { exceptionType: typeof error };
  const withCode = error as Error & { code?: unknown; codeName?: unknown };
  const cause = error.cause instanceof Error ? error.cause as Error & { code?: unknown; codeName?: unknown } : undefined;
  const root = `${process.cwd()}/`;
  const stackFrames = error.stack?.split("\n").slice(1).flatMap((frame) => {
    const match = frame.trim().match(/(?:^|\()((?:file:\/\/)?[^()\s]+):(\d+):(\d+)\)?$/);
    if (!match) return [];
    const path = match[1].replace(/^file:\/\//, "");
    return path.startsWith(root) ? [`${path.slice(root.length)}:${match[2]}:${match[3]}`] : [];
  }).slice(0, 6);
  return {
    exceptionType: diagnosticLabel(error.name),
    exceptionCode: diagnosticLabel(withCode.codeName ?? withCode.code),
    causeType: cause ? diagnosticLabel(cause.name) : undefined,
    causeCode: cause ? diagnosticLabel(cause.codeName ?? cause.code) : undefined,
    stackFrames: stackFrames?.length ? stackFrames : undefined,
  };
}

async function runRoute(route: string, action: (requestId: string) => Promise<Response>, event: string): Promise<Response> {
  const requestId = createRequestId();
  try {
    return await action(requestId);
  } catch (error) {
    const code = error instanceof AppError ? error.code : "INTERNAL_ERROR";
    log(error instanceof AppError && error.status < 500 ? "warn" : "error", event, {
      requestId,
      route,
      errorCode: code,
      ...(error instanceof AppError ? {} : errorDiagnostics(error)),
    });
    return apiError(error, requestId);
  }
}

export function authRoute(route: string, action: (requestId: string) => Promise<Response>): Promise<Response> {
  return runRoute(route, action, "auth_request_failed");
}

export function apiRoute(route: string, action: (requestId: string) => Promise<Response>): Promise<Response> {
  return runRoute(route, action, "api_request_failed");
}

export async function parseBody<T extends z.ZodType>(request: Request, schema: T): Promise<z.infer<T>> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new AppError("VALIDATION_ERROR", "Content-Type must be application/json.", 415);
  }
  const declaredSize = Number(request.headers.get("content-length") ?? 0);
  if (declaredSize > maxBodyBytes) throw new AppError("VALIDATION_ERROR", "Request body is too large.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new AppError("VALIDATION_ERROR", "Invalid JSON body.", 400);
  const chunks: Uint8Array[] = [];
  let byteCount = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteCount += value.byteLength;
      if (byteCount > maxBodyBytes) {
        await reader.cancel().catch(() => undefined);
        throw new AppError("VALIDATION_ERROR", "Request body is too large.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  let body: string;
  try {
    body = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, byteCount));
  } catch {
    throw new AppError("VALIDATION_ERROR", "Invalid UTF-8 body.", 400);
  }
  let value: unknown;
  try { value = JSON.parse(body); } catch { throw new AppError("VALIDATION_ERROR", "Invalid JSON body.", 400); }
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new AppError("VALIDATION_ERROR", "Please check the submitted fields.", 422, { fields: z.flattenError(result.error).fieldErrors });
  }
  return result.data;
}

export function assertAllowedOrigin(request: Request): void {
  const { APP_URL, ALLOWED_ORIGINS } = getAuthEnv();
  const allowed = new Set([new URL(APP_URL).origin, ...(ALLOWED_ORIGINS ?? "").split(",").map((value) => value.trim()).filter(Boolean)]);
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if ((origin && !allowed.has(origin)) || fetchSite === "cross-site") {
    throw new AppError("CSRF_VALIDATION_FAILED", "Cross-site request rejected.", 403);
  }
}

export function clientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded && forwarded.length <= 64 ? forwarded : null;
}
