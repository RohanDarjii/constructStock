import { z } from "zod";
import { createTransferSchema, listTransfersSchema } from "@/modules/transfers/schemas/transfer";
import { listTransfers, requestTransfer } from "@/modules/transfers/services/transfer-service";
import { requireIdentity } from "@/server/auth/authorize";
import { apiSuccess } from "@/server/http/api-response";
import { apiRoute, parseBody } from "@/server/http/auth-route";
import { requireMutationIdentity } from "@/server/http/authenticated-request";
import { AppError } from "@/shared/errors/app-error";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return apiRoute("transfers.list", async (requestId) => {
    const parsed = listTransfersSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", "Check the transfer filters.", 422, { fields: z.flattenError(parsed.error).fieldErrors });
    const result = await listTransfers(await requireIdentity(), parsed.data);
    return apiSuccess({ records: result.transfers, summary: result.summary }, { requestId, pagination: result.pagination });
  });
}

export async function POST(request: Request): Promise<Response> {
  return apiRoute("transfers.request", async (requestId) => {
    const identity = await requireMutationIdentity(request);
    const input = await parseBody(request, createTransferSchema);
    return apiSuccess(await requestTransfer(identity, input, request.headers.get("Idempotency-Key") ?? ""), { requestId }, 201);
  });
}
