import { auditQuerySchema } from "@/modules/audit/schemas/audit";
import { listAuditLogs } from "@/modules/audit/services/audit-read-service";
import { requireIdentity } from "@/server/auth/authorize";
import { apiSuccess } from "@/server/http/api-response";
import { apiRoute } from "@/server/http/auth-route";
import { AppError } from "@/shared/errors/app-error";

export const runtime = "nodejs";
export async function GET(request: Request): Promise<Response> {
  return apiRoute("audit.list", async (requestId) => {
    const parsed = auditQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", "Choose valid audit filters.", 422);
    const data = await listAuditLogs(await requireIdentity(), parsed.data);
    return apiSuccess(data.auditLogs, { requestId, pagination: data.pagination });
  });
}
