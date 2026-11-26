import { updateOrganizationSchema } from "@/modules/organization/schemas/organization";
import { getOrganization, updateOrganization } from "@/modules/organization/services/organization-service";
import { requireIdentity } from "@/server/auth/authorize";
import { apiSuccess } from "@/server/http/api-response";
import { apiRoute, parseBody } from "@/server/http/auth-route";
import { requireMutationIdentity } from "@/server/http/authenticated-request";

export const runtime = "nodejs";
export async function GET(): Promise<Response> {
  return apiRoute("organization.get", async (requestId) => apiSuccess(await getOrganization(await requireIdentity()), { requestId }));
}
export async function PATCH(request: Request): Promise<Response> {
  return apiRoute("organization.update", async (requestId) => apiSuccess(await updateOrganization(await requireMutationIdentity(request), await parseBody(request, updateOrganizationSchema)), { requestId }));
}
