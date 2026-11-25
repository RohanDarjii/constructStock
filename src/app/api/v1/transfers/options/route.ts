import { z } from "zod";
import { transferOptionsSchema } from "@/modules/transfers/schemas/transfer";
import { getTransferOptions } from "@/modules/transfers/services/transfer-service";
import { requireIdentity } from "@/server/auth/authorize";
import { apiSuccess } from "@/server/http/api-response";
import { apiRoute } from "@/server/http/auth-route";
import { AppError } from "@/shared/errors/app-error";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return apiRoute("transfers.options", async (requestId) => {
    const parsed = transferOptionsSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", "Check the transfer options.", 422, { fields: z.flattenError(parsed.error).fieldErrors });
    return apiSuccess(await getTransferOptions(await requireIdentity(), parsed.data.sourceSiteId, parsed.data.materialId), { requestId });
  });
}
