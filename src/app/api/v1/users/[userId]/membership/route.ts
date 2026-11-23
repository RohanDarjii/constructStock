import { updateMembershipSchema } from "@/modules/users/schemas/team";
import { updateMembership } from "@/modules/users/services/team-service";
import { apiSuccess } from "@/server/http/api-response";
import { apiRoute, parseBody } from "@/server/http/auth-route";
import { requireMutationIdentity } from "@/server/http/authenticated-request";

export const runtime = "nodejs";
type Context = { params: Promise<{ userId: string }> };

export async function PATCH(request: Request, context: Context): Promise<Response> {
  return apiRoute("users.membership.update", async (requestId) => {
    const identity = await requireMutationIdentity(request);
    return apiSuccess(await updateMembership(identity, (await context.params).userId, await parseBody(request, updateMembershipSchema)), { requestId });
  });
}
