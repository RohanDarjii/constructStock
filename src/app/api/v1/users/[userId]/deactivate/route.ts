import { updateMembership } from "@/modules/users/services/team-service";
import { apiSuccess } from "@/server/http/api-response";
import { apiRoute } from "@/server/http/auth-route";
import { requireMutationIdentity } from "@/server/http/authenticated-request";

export const runtime = "nodejs";
type Context = { params: Promise<{ userId: string }> };

export async function POST(request: Request, context: Context): Promise<Response> {
  return apiRoute("users.deactivate", async (requestId) => {
    const identity = await requireMutationIdentity(request);
    return apiSuccess(await updateMembership(identity, (await context.params).userId, { status: "INACTIVE" }), { requestId });
  });
}
