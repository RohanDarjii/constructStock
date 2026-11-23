import { replaceSitesSchema } from "@/modules/users/schemas/team";
import { replaceMemberSites } from "@/modules/users/services/team-service";
import { apiSuccess } from "@/server/http/api-response";
import { apiRoute, parseBody } from "@/server/http/auth-route";
import { requireMutationIdentity } from "@/server/http/authenticated-request";

export const runtime = "nodejs";
type Context = { params: Promise<{ userId: string }> };

export async function PUT(request: Request, context: Context): Promise<Response> {
  return apiRoute("users.sites.replace", async (requestId) => {
    const identity = await requireMutationIdentity(request);
    return apiSuccess(await replaceMemberSites(identity, (await context.params).userId, (await parseBody(request, replaceSitesSchema)).siteIds), { requestId });
  });
}
