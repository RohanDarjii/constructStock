import "server-only";
import { z } from "zod";
import { exportQuerySchema, reportKindSchema, reportQuerySchema } from "../schemas/report";
import { getReport } from "./report-service";
import { renderReportExport } from "./report-export-service";
import { requireIdentity } from "@/server/auth/authorize";
import { apiSuccess } from "@/server/http/api-response";
import { AppError } from "@/shared/errors/app-error";

export function parseReportQuery(url: string, exportFile: boolean) {
  const schema = exportFile ? exportQuerySchema : reportQuerySchema;
  const result = schema.safeParse(Object.fromEntries(new URL(url).searchParams));
  if (!result.success) throw new AppError("VALIDATION_ERROR", "Choose valid report filters.", 422);
  return result.data;
}

export async function reportResponse(request: Request, kind: string, requestId: string) {
  const parsedKind = reportKindSchema.safeParse(kind);
  if (!parsedKind.success || kind === "sites") throw new AppError("REPORT_NOT_FOUND", "Report not found.", 404);
  const query = reportQuerySchema.parse(parseReportQuery(request.url, false));
  return apiSuccess(await getReport(await requireIdentity(), parsedKind.data, query), { requestId });
}

export async function exportResponse(request: Request, kind: string) {
  const parsedKind = reportKindSchema.safeParse(kind);
  if (!parsedKind.success) throw new AppError("REPORT_NOT_FOUND", "Report not found.", 404);
  const query = exportQuerySchema.parse(parseReportQuery(request.url, true));
  const report = await getReport(await requireIdentity(), parsedKind.data, query);
  if (query.format === "pdf" && report.rows.length > 500) throw new AppError("REPORT_TOO_LARGE", "PDF exports support up to 500 rows. Narrow the filters.", 422);
  const file = await renderReportExport(report, query.format);
  return new Response(file.bytes as BodyInit, { headers: { "Content-Type": file.contentType, "Content-Disposition": `attachment; filename="constructstock-${kind}-${query.from ?? "report"}.${file.extension}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}

export function parseSiteId(value: string) {
  const result = z.string().regex(/^[a-fA-F0-9]{24}$/).safeParse(value);
  if (!result.success) throw new AppError("SITE_NOT_FOUND", "Site not found.", 404);
  return result.data;
}
