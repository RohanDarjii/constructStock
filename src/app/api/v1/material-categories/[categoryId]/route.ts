import { updateCategorySchema } from "@/modules/materials/schemas/catalogue";
import { updateCategory } from "@/modules/materials/services/category-service";
import { apiSuccess } from "@/server/http/api-response";
import { apiRoute, parseBody } from "@/server/http/auth-route";
import { requireMutationIdentity } from "@/server/http/authenticated-request";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ categoryId: string }> }): Promise<Response> {
  return apiRoute("material_categories.update", async (requestId) => {
    const identity = await requireMutationIdentity(request);
    const input = await parseBody(request, updateCategorySchema);
    const { categoryId } = await params;
    return apiSuccess(await updateCategory(identity, categoryId, input), { requestId });
  });
}
