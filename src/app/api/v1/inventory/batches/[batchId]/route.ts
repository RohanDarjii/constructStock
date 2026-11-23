import { getBatch } from "@/modules/inventory/services/inventory-read-service";
import { requireIdentity } from "@/server/auth/authorize";
import { apiSuccess } from "@/server/http/api-response";
import { apiRoute } from "@/server/http/auth-route";

export const runtime = "nodejs";
type Context = { params: Promise<{ batchId: string }> };

export async function GET(_request: Request, context: Context): Promise<Response> {
  return apiRoute("inventory.batches.get", async (requestId) => {
    return apiSuccess(await getBatch(await requireIdentity(), (await context.params).batchId), { requestId });
  });
}
