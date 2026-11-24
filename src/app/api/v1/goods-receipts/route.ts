import { z } from "zod";
import { createGoodsReceiptSchema, listGoodsReceiptsSchema } from "@/modules/receiving/schemas/goods-receipt";
import { createGoodsReceipt, listGoodsReceipts } from "@/modules/receiving/services/goods-receipt-service";
import { requireIdentity } from "@/server/auth/authorize";
import { apiSuccess } from "@/server/http/api-response";
import { apiRoute, parseBody } from "@/server/http/auth-route";
import { requireMutationIdentity } from "@/server/http/authenticated-request";
import { AppError } from "@/shared/errors/app-error";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return apiRoute("goods_receipts.list", async (requestId) => {
    const identity = await requireIdentity();
    const parsed = listGoodsReceiptsSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", "Check the receipt filters.", 422, { fields: z.flattenError(parsed.error).fieldErrors });
    const result = await listGoodsReceipts(identity, parsed.data);
    return apiSuccess(result.receipts, { requestId, pagination: result.pagination });
  });
}

export async function POST(request: Request): Promise<Response> {
  return apiRoute("goods_receipts.create", async (requestId) => {
    const identity = await requireMutationIdentity(request);
    const input = await parseBody(request, createGoodsReceiptSchema);
    return apiSuccess(await createGoodsReceipt(identity, input, request.headers.get("Idempotency-Key") ?? ""), { requestId }, 201);
  });
}
