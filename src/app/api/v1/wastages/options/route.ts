import { z } from "zod";
import { wastageOptionsSchema } from "@/modules/wastage/schemas/wastage";
import { getWastageOptions } from "@/modules/wastage/services/wastage-service";
import { requireIdentity } from "@/server/auth/authorize";
import { apiSuccess } from "@/server/http/api-response";
import { apiRoute } from "@/server/http/auth-route";
import { AppError } from "@/shared/errors/app-error";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return apiRoute("wastages.options", async (requestId) => {
    const parsed = wastageOptionsSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", "Choose a valid site and material.", 422, { fields: z.flattenError(parsed.error).fieldErrors });
    return apiSuccess(await getWastageOptions(await requireIdentity(), parsed.data.siteId, parsed.data.materialId), { requestId });
  });
}
