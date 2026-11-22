import { restoreSite } from "@/modules/sites/services/site-service";
import { apiSuccess } from "@/server/http/api-response";
import { apiRoute } from "@/server/http/auth-route";
import { requireMutationIdentity } from "@/server/http/authenticated-request";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ siteId: string }> }): Promise<Response> {
  return apiRoute("sites.restore", async (requestId) => {
    const identity = await requireMutationIdentity(request);
    const { siteId } = await params;
    return apiSuccess(await restoreSite(identity, siteId), { requestId });
  });
}
