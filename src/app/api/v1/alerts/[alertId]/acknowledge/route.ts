import { acknowledgeAlertSchema } from "@/modules/alerts/schemas/alert";
import { acknowledgeAlert } from "@/modules/alerts/services/stock-alert-service";
import { apiSuccess } from "@/server/http/api-response";
import { apiRoute, parseBody } from "@/server/http/auth-route";
import { requireMutationIdentity } from "@/server/http/authenticated-request";

export const runtime = "nodejs";
type Context = { params: Promise<{ alertId: string }> };

export async function POST(request: Request, context: Context): Promise<Response> {
  return apiRoute("alerts.acknowledge", async (requestId) => {
    const identity = await requireMutationIdentity(request);
    const input = request.body ? await parseBody(request, acknowledgeAlertSchema) : { note: null };
    return apiSuccess(await acknowledgeAlert(identity, (await context.params).alertId, input.note), { requestId });
  });
}
