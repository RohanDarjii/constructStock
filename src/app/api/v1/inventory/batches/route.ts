import { z } from "zod";
import { batchQuerySchema } from "@/modules/inventory/schemas/inventory";
import { listBatches } from "@/modules/inventory/services/inventory-read-service";
import { requireIdentity } from "@/server/auth/authorize";
import { apiSuccess } from "@/server/http/api-response";
import { apiRoute } from "@/server/http/auth-route";
import { AppError } from "@/shared/errors/app-error";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return apiRoute("inventory.batches.list", async (requestId) => {
    const identity = await requireIdentity();
    const parsed = batchQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", "Check the batch filters.", 422, { fields: z.flattenError(parsed.error).fieldErrors });
    const result = await listBatches(identity, parsed.data);
    return apiSuccess(result.batches, { requestId, pagination: result.pagination });
  });
}
