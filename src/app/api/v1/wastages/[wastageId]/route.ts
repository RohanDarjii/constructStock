import { getWastage } from "@/modules/wastage/services/wastage-service";
import { requireIdentity } from "@/server/auth/authorize";
import { apiSuccess } from "@/server/http/api-response";
import { apiRoute } from "@/server/http/auth-route";

export const runtime = "nodejs";
type Context = { params: Promise<{ wastageId: string }> };

export async function GET(_request: Request, context: Context): Promise<Response> {
  return apiRoute("wastages.get", async (requestId) => apiSuccess(await getWastage(await requireIdentity(), (await context.params).wastageId), { requestId }));
}
