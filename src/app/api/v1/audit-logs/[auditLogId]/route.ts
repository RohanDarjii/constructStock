import { getAuditLog } from "@/modules/audit/services/audit-read-service";
import { requireIdentity } from "@/server/auth/authorize";
import { apiSuccess } from "@/server/http/api-response";
import { apiRoute } from "@/server/http/auth-route";

export const runtime = "nodejs";
type Context = { params: Promise<{ auditLogId: string }> };
export async function GET(_request: Request, context: Context): Promise<Response> {
  return apiRoute("audit.get", async (requestId) => apiSuccess(await getAuditLog(await requireIdentity(), (await context.params).auditLogId), { requestId }));
}
