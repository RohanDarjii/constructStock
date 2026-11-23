import { z } from "zod";
import { createCategorySchema, listCategoriesQuerySchema } from "@/modules/materials/schemas/catalogue";
import { createCategory, listCategories } from "@/modules/materials/services/category-service";
import { requireIdentity } from "@/server/auth/authorize";
import { apiSuccess } from "@/server/http/api-response";
import { apiRoute, parseBody } from "@/server/http/auth-route";
import { requireMutationIdentity } from "@/server/http/authenticated-request";
import { AppError } from "@/shared/errors/app-error";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return apiRoute("material_categories.list", async (requestId) => {
    const identity = await requireIdentity();
    const query = listCategoriesQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!query.success) throw new AppError("VALIDATION_ERROR", "Check the category filters.", 422, { fields: z.flattenError(query.error).fieldErrors });
    return apiSuccess(await listCategories(identity, query.data), { requestId });
  });
}

export async function POST(request: Request): Promise<Response> {
  return apiRoute("material_categories.create", async (requestId) => {
    const identity = await requireMutationIdentity(request);
    return apiSuccess(await createCategory(identity, await parseBody(request, createCategorySchema)), { requestId }, 201);
  });
}
