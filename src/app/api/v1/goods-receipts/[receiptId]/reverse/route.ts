import { reverseGoodsReceiptSchema } from "@/modules/receiving/schemas/goods-receipt";
import { reverseGoodsReceipt } from "@/modules/receiving/services/goods-receipt-service";
import { apiSuccess } from "@/server/http/api-response";
import { apiRoute, parseBody } from "@/server/http/auth-route";
import { requireMutationIdentity } from "@/server/http/authenticated-request";

export const runtime = "nodejs";
type Context = { params: Promise<{ receiptId: string }> };

export async function POST(request: Request, context: Context): Promise<Response> {
  return apiRoute("goods_receipts.reverse", async (requestId) => {
    const identity = await requireMutationIdentity(request);
    const input = await parseBody(request, reverseGoodsReceiptSchema);
    return apiSuccess(await reverseGoodsReceipt(identity, (await context.params).receiptId, input.reason, request.headers.get("Idempotency-Key") ?? ""), { requestId });
  });
}
