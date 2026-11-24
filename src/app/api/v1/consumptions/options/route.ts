import { z } from "zod";
import { issueOptionsSchema } from "@/modules/consumption/schemas/consumption";
import { getIssueOptions } from "@/modules/consumption/services/consumption-service";
import { requireIdentity } from "@/server/auth/authorize";
import { apiSuccess } from "@/server/http/api-response";
import { apiRoute } from "@/server/http/auth-route";
import { AppError } from "@/shared/errors/app-error";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return apiRoute("consumptions.options", async (requestId) => {
    const parsed = issueOptionsSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", "Choose a valid site and material.", 422, { fields: z.flattenError(parsed.error).fieldErrors });
    return apiSuccess(await getIssueOptions(await requireIdentity(), parsed.data.siteId, parsed.data.materialId), { requestId });
  });
}
