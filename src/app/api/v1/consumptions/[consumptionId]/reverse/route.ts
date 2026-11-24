import { reverseConsumptionSchema } from "@/modules/consumption/schemas/consumption";
import { reverseConsumption } from "@/modules/consumption/services/consumption-service";
import { apiSuccess } from "@/server/http/api-response";
import { apiRoute, parseBody } from "@/server/http/auth-route";
import { requireMutationIdentity } from "@/server/http/authenticated-request";

export const runtime = "nodejs";
type Context = { params: Promise<{ consumptionId: string }> };

export async function POST(request: Request, context: Context): Promise<Response> {
  return apiRoute("consumptions.reverse", async (requestId) => {
    const identity = await requireMutationIdentity(request);
    const input = await parseBody(request, reverseConsumptionSchema);
    return apiSuccess(await reverseConsumption(identity, (await context.params).consumptionId, input.reason, request.headers.get("Idempotency-Key") ?? ""), { requestId });
  });
}
