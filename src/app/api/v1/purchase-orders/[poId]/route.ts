import { updatePurchaseOrderSchema } from "@/modules/purchasing/schemas/purchase-order";
import { getPurchaseOrder, updatePurchaseOrder } from "@/modules/purchasing/services/purchase-order-service";
import { requireIdentity } from "@/server/auth/authorize";
import { apiSuccess } from "@/server/http/api-response";
import { apiRoute, parseBody } from "@/server/http/auth-route";
import { requireMutationIdentity } from "@/server/http/authenticated-request";

export const runtime = "nodejs";
type Context = { params: Promise<{ poId: string }> };

export async function GET(_request: Request, context: Context): Promise<Response> {
  return apiRoute("purchase_orders.get", async (requestId) => apiSuccess(await getPurchaseOrder(await requireIdentity(), (await context.params).poId), { requestId }));
}

export async function PATCH(request: Request, context: Context): Promise<Response> {
  return apiRoute("purchase_orders.update", async (requestId) => {
    const identity = await requireMutationIdentity(request);
    const input = await parseBody(request, updatePurchaseOrderSchema);
    return apiSuccess(await updatePurchaseOrder(identity, (await context.params).poId, input), { requestId });
  });
}
