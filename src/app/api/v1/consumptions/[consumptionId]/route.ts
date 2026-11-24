import { getConsumption } from "@/modules/consumption/services/consumption-service";
import { requireIdentity } from "@/server/auth/authorize";
import { apiSuccess } from "@/server/http/api-response";
import { apiRoute } from "@/server/http/auth-route";

export const runtime = "nodejs";
type Context = { params: Promise<{ consumptionId: string }> };

export async function GET(_request: Request, context: Context): Promise<Response> {
  return apiRoute("consumptions.get", async (requestId) => apiSuccess(await getConsumption(await requireIdentity(), (await context.params).consumptionId), { requestId }));
}
