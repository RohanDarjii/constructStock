import "server-only";
import { randomUUID } from "node:crypto";
import { AppError } from "@/shared/errors/app-error";

export interface ApiMeta {
  requestId: string;
  pagination?: {
    nextCursor: string | null;
    hasMore: boolean;
    limit: number;
  };
}

export function createRequestId(): string {
  return `req_${randomUUID()}`;
}

export function apiSuccess<T>(data: T, meta: ApiMeta, status = 200): Response {
  return Response.json(
    { success: true, data, meta },
    { status, headers: { "X-Request-Id": meta.requestId, "Cache-Control": "no-store" } },
  );
}

export function apiError(error: unknown, requestId: string): Response {
  const safeError = error instanceof AppError
    ? error
    : new AppError("INTERNAL_ERROR", "An unexpected error occurred.", 500);

  return Response.json(
    {
      success: false,
      error: {
        code: safeError.code,
        message: safeError.message,
        ...(safeError.details ? { details: safeError.details } : {}),
      },
      meta: { requestId },
    },
    { status: safeError.status, headers: { "X-Request-Id": requestId, "Cache-Control": "no-store" } },
  );
}
