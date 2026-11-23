import { z } from "zod";
import { balanceQuerySchema } from "@/modules/inventory/schemas/inventory";
import { listBalances } from "@/modules/inventory/services/inventory-read-service";
import { requireIdentity } from "@/server/auth/authorize";
import { apiSuccess } from "@/server/http/api-response";
import { apiRoute } from "@/server/http/auth-route";
import { AppError } from "@/shared/errors/app-error";

export const runtime = "nodejs";
type Context = { params: Promise<{ materialId: string }> };

export async function GET(request: Request, context: Context): Promise<Response> {
  return apiRoute("materials.inventory.list", async (requestId) => {
    const identity = await requireIdentity();
    const parsed = balanceQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", "Check the inventory filters.", 422, { fields: z.flattenError(parsed.error).fieldErrors });
    const result = await listBalances(identity, { ...parsed.data, materialId: (await context.params).materialId });
    return apiSuccess(result.balances, { requestId, pagination: result.pagination });
  });
}
