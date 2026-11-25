import { transferDecisionSchema } from "@/modules/transfers/schemas/transfer";
import { closeTransfer } from "@/modules/transfers/services/transfer-service";
import { apiSuccess } from "@/server/http/api-response";
import { apiRoute, parseBody } from "@/server/http/auth-route";
import { requireMutationIdentity } from "@/server/http/authenticated-request";

export const runtime = "nodejs";
type Context = { params: Promise<{ transferId: string }> };
export async function POST(request: Request, context: Context): Promise<Response> {
  return apiRoute("transfers.reject", async (requestId) => {
    const identity = await requireMutationIdentity(request);
    const input = await parseBody(request, transferDecisionSchema);
    return apiSuccess(await closeTransfer(identity, (await context.params).transferId, "reject", input.reason, request.headers.get("Idempotency-Key") ?? ""), { requestId });
  });
}
