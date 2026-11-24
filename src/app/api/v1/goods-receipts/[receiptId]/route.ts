import { getGoodsReceipt } from "@/modules/receiving/services/goods-receipt-service";
import { requireIdentity } from "@/server/auth/authorize";
import { apiSuccess } from "@/server/http/api-response";
import { apiRoute } from "@/server/http/auth-route";

export const runtime = "nodejs";
type Context = { params: Promise<{ receiptId: string }> };

export async function GET(_request: Request, context: Context): Promise<Response> {
  return apiRoute("goods_receipts.get", async (requestId) => apiSuccess(await getGoodsReceipt(await requireIdentity(), (await context.params).receiptId), { requestId }));
}
