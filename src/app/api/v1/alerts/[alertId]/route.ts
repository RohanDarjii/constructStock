import { getAlert } from "@/modules/alerts/services/stock-alert-service";
import { requireIdentity } from "@/server/auth/authorize";
import { apiSuccess } from "@/server/http/api-response";
import { apiRoute } from "@/server/http/auth-route";

export const runtime = "nodejs";
type Context = { params: Promise<{ alertId: string }> };

export async function GET(_request: Request, context: Context): Promise<Response> {
  return apiRoute("alerts.detail", async (requestId) => apiSuccess(await getAlert(await requireIdentity(), (await context.params).alertId), { requestId }));
}
