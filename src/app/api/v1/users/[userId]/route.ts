import { getTeamMember } from "@/modules/users/services/team-service";
import { requireIdentity } from "@/server/auth/authorize";
import { apiSuccess } from "@/server/http/api-response";
import { apiRoute } from "@/server/http/auth-route";

export const runtime = "nodejs";
type Context = { params: Promise<{ userId: string }> };

export async function GET(_request: Request, context: Context): Promise<Response> {
  return apiRoute("users.get", async (requestId) => {
    const identity = await requireIdentity();
    return apiSuccess(await getTeamMember(identity, (await context.params).userId), { requestId });
  });
}
