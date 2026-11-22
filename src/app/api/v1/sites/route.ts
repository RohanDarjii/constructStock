import { z } from "zod";
import { createSiteSchema, listSitesQuerySchema } from "@/modules/sites/schemas/site";
import { createSite, listSites } from "@/modules/sites/services/site-service";
import { requireIdentity } from "@/server/auth/authorize";
import { apiSuccess } from "@/server/http/api-response";
import { apiRoute, parseBody } from "@/server/http/auth-route";
import { requireMutationIdentity } from "@/server/http/authenticated-request";
import { AppError } from "@/shared/errors/app-error";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return apiRoute("sites.list", async (requestId) => {
    const identity = await requireIdentity();
    const parsed = listSitesQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", "Check the site filters.", 422, { fields: z.flattenError(parsed.error).fieldErrors });
    const result = await listSites(identity, parsed.data);
    return apiSuccess(result.sites, { requestId, pagination: result.pagination });
  });
}

export async function POST(request: Request): Promise<Response> {
  return apiRoute("sites.create", async (requestId) => {
    const identity = await requireMutationIdentity(request);
    const input = await parseBody(request, createSiteSchema);
    return apiSuccess(await createSite(identity, input), { requestId }, 201);
  });
}
