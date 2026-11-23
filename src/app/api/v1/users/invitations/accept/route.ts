import { acceptInvitationSchema } from "@/modules/users/schemas/team";
import { acceptInvitation } from "@/modules/users/services/team-service";
import { apiSuccess } from "@/server/http/api-response";
import { apiRoute, assertAllowedOrigin, clientIp, parseBody } from "@/server/http/auth-route";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return apiRoute("users.invitations.accept", async (requestId) => {
    assertAllowedOrigin(request);
    return apiSuccess(await acceptInvitation(await parseBody(request, acceptInvitationSchema), clientIp(request)), { requestId }, 201);
  });
}
