import { getBalance } from "@/modules/inventory/services/inventory-read-service";
import { requireIdentity } from "@/server/auth/authorize";
import { apiSuccess } from "@/server/http/api-response";
import { apiRoute } from "@/server/http/auth-route";

export const runtime = "nodejs";
type Context = { params: Promise<{ balanceId: string }> };

export async function GET(_request: Request, context: Context): Promise<Response> {
  return apiRoute("inventory.balances.get", async (requestId) => {
    return apiSuccess(await getBalance(await requireIdentity(), (await context.params).balanceId), { requestId });
  });
}
