import { z } from "zod";
import { createMaterialSchema, listMaterialsQuerySchema } from "@/modules/materials/schemas/catalogue";
import { createMaterial, listMaterials } from "@/modules/materials/services/material-service";
import { requireIdentity } from "@/server/auth/authorize";
import { apiSuccess } from "@/server/http/api-response";
import { apiRoute, parseBody } from "@/server/http/auth-route";
import { requireMutationIdentity } from "@/server/http/authenticated-request";
import { AppError } from "@/shared/errors/app-error";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return apiRoute("materials.list", async (requestId) => {
    const identity = await requireIdentity();
    const query = listMaterialsQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!query.success) throw new AppError("VALIDATION_ERROR", "Check the material filters.", 422, { fields: z.flattenError(query.error).fieldErrors });
    const result = await listMaterials(identity, query.data);
    return apiSuccess(result.materials, { requestId, pagination: result.pagination });
  });
}

export async function POST(request: Request): Promise<Response> {
  return apiRoute("materials.create", async (requestId) => {
    const identity = await requireMutationIdentity(request);
    return apiSuccess(await createMaterial(identity, await parseBody(request, createMaterialSchema)), { requestId }, 201);
  });
}
