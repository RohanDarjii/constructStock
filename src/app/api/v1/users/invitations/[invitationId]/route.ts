import { revokeInvitation } from "@/modules/users/services/team-service";
import { apiSuccess } from "@/server/http/api-response";
import { apiRoute } from "@/server/http/auth-route";
import { requireMutationIdentity } from "@/server/http/authenticated-request";

export const runtime = "nodejs";
type Context = { params: Promise<{ invitationId: string }> };

export async function DELETE(request: Request, context: Context): Promise<Response> {
  return apiRoute("users.invitations.revoke", async (requestId) => {
    const identity = await requireMutationIdentity(request);
    return apiSuccess(await revokeInvitation(identity, (await context.params).invitationId), { requestId });
  });
}
