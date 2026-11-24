import { purchaseOrderReasonSchema } from "@/modules/purchasing/schemas/purchase-order";
import { transitionPurchaseOrder } from "@/modules/purchasing/services/purchase-order-service";
import { apiSuccess } from "@/server/http/api-response";
import { apiRoute, parseBody } from "@/server/http/auth-route";
import { requireMutationIdentity } from "@/server/http/authenticated-request";

export const runtime = "nodejs";
type Context = { params: Promise<{ poId: string }> };

export async function POST(request: Request, context: Context): Promise<Response> {
  return apiRoute("purchase_orders.reject", async (requestId) => {
    const identity = await requireMutationIdentity(request);
    const input = await parseBody(request, purchaseOrderReasonSchema);
    return apiSuccess(await transitionPurchaseOrder(identity, (await context.params).poId, "reject", input.remarks), { requestId });
  });
}
