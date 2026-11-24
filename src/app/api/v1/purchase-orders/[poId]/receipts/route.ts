import { listPurchaseOrderReceipts } from "@/modules/receiving/services/goods-receipt-service";
import { requireIdentity } from "@/server/auth/authorize";
import { apiSuccess } from "@/server/http/api-response";
import { apiRoute } from "@/server/http/auth-route";

export const runtime = "nodejs";
type Context = { params: Promise<{ poId: string }> };

export async function GET(_request: Request, context: Context): Promise<Response> {
  return apiRoute("purchase_orders.receipts", async (requestId) => apiSuccess(await listPurchaseOrderReceipts(await requireIdentity(), (await context.params).poId), { requestId }));
}
