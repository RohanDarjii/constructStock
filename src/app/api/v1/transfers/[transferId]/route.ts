import { getTransfer } from "@/modules/transfers/services/transfer-service";
import { requireIdentity } from "@/server/auth/authorize";
import { apiSuccess } from "@/server/http/api-response";
import { apiRoute } from "@/server/http/auth-route";

export const runtime = "nodejs";
type Context = { params: Promise<{ transferId: string }> };

export async function GET(_request: Request, context: Context): Promise<Response> {
  return apiRoute("transfers.detail", async (requestId) => apiSuccess(await getTransfer(await requireIdentity(), (await context.params).transferId), { requestId }));
}
