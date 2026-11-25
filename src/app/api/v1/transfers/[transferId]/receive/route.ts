import { transferActionSchema } from "@/modules/transfers/schemas/transfer";
import { receiveTransfer } from "@/modules/transfers/services/transfer-service";
import { apiSuccess } from "@/server/http/api-response";
import { apiRoute, parseBody } from "@/server/http/auth-route";
import { requireMutationIdentity } from "@/server/http/authenticated-request";

export const runtime = "nodejs";
type Context = { params: Promise<{ transferId: string }> };
export async function POST(request: Request, context: Context): Promise<Response> {
  return apiRoute("transfers.receive", async (requestId) => {
    const identity = await requireMutationIdentity(request);
    if (request.body) await parseBody(request, transferActionSchema);
    return apiSuccess(await receiveTransfer(identity, (await context.params).transferId, request.headers.get("Idempotency-Key") ?? ""), { requestId });
  });
}
