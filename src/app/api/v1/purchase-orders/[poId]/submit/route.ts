import { transitionPurchaseOrder } from "@/modules/purchasing/services/purchase-order-service";
import { apiSuccess } from "@/server/http/api-response";
import { apiRoute } from "@/server/http/auth-route";
import { requireMutationIdentity } from "@/server/http/authenticated-request";

export const runtime = "nodejs";
type Context = { params: Promise<{ poId: string }> };

export async function POST(request: Request, context: Context): Promise<Response> {
  return apiRoute("purchase_orders.submit", async (requestId) => apiSuccess(await transitionPurchaseOrder(await requireMutationIdentity(request), (await context.params).poId, "submit"), { requestId }));
}
