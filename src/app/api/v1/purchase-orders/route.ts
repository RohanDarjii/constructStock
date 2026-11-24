import { z } from "zod";
import { createPurchaseOrderSchema, listPurchaseOrdersSchema } from "@/modules/purchasing/schemas/purchase-order";
import { createPurchaseOrder, listPurchaseOrders } from "@/modules/purchasing/services/purchase-order-service";
import { requireIdentity } from "@/server/auth/authorize";
import { apiSuccess } from "@/server/http/api-response";
import { apiRoute, parseBody } from "@/server/http/auth-route";
import { requireMutationIdentity } from "@/server/http/authenticated-request";
import { AppError } from "@/shared/errors/app-error";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return apiRoute("purchase_orders.list", async (requestId) => {
    const identity = await requireIdentity();
    const parsed = listPurchaseOrdersSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", "Check the purchase order filters.", 422, { fields: z.flattenError(parsed.error).fieldErrors });
    const result = await listPurchaseOrders(identity, parsed.data);
    return apiSuccess(result.purchaseOrders, { requestId, pagination: result.pagination });
  });
}

export async function POST(request: Request): Promise<Response> {
  return apiRoute("purchase_orders.create", async (requestId) => {
    const identity = await requireMutationIdentity(request);
    const input = await parseBody(request, createPurchaseOrderSchema);
    return apiSuccess(await createPurchaseOrder(identity, input), { requestId }, 201);
  });
}
