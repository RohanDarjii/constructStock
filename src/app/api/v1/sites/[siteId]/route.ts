import { updateSiteSchema } from "@/modules/sites/schemas/site";
import { getSite, updateSite } from "@/modules/sites/services/site-service";
import { requireIdentity } from "@/server/auth/authorize";
import { apiSuccess } from "@/server/http/api-response";
import { apiRoute, parseBody } from "@/server/http/auth-route";
import { requireMutationIdentity } from "@/server/http/authenticated-request";

export const runtime = "nodejs";
type Context = { params: Promise<{ siteId: string }> };

export async function GET(_request: Request, context: Context): Promise<Response> {
  return apiRoute("sites.get", async (requestId) => {
    const identity = await requireIdentity();
    const { siteId } = await context.params;
    return apiSuccess(await getSite(identity, siteId), { requestId });
  });
}

export async function PATCH(request: Request, context: Context): Promise<Response> {
  return apiRoute("sites.update", async (requestId) => {
    const identity = await requireMutationIdentity(request);
    const input = await parseBody(request, updateSiteSchema);
    const { siteId } = await context.params;
    return apiSuccess(await updateSite(identity, siteId, input), { requestId });
  });
}
