import { reverseWastageSchema } from "@/modules/wastage/schemas/wastage";
import { reverseWastage } from "@/modules/wastage/services/wastage-service";
import { apiSuccess } from "@/server/http/api-response";
import { apiRoute, parseBody } from "@/server/http/auth-route";
import { requireMutationIdentity } from "@/server/http/authenticated-request";

export const runtime = "nodejs";
type Context = { params: Promise<{ wastageId: string }> };

export async function POST(request: Request, context: Context): Promise<Response> {
  return apiRoute("wastages.reverse", async (requestId) => {
    const identity = await requireMutationIdentity(request);
    const input = await parseBody(request, reverseWastageSchema);
    return apiSuccess(await reverseWastage(identity, (await context.params).wastageId, input.reason, request.headers.get("Idempotency-Key") ?? ""), { requestId });
  });
}
