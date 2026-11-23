import { archiveCategory } from "@/modules/materials/services/category-service";
import { apiSuccess } from "@/server/http/api-response";
import { apiRoute } from "@/server/http/auth-route";
import { requireMutationIdentity } from "@/server/http/authenticated-request";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ categoryId: string }> }): Promise<Response> {
  return apiRoute("material_categories.archive", async (requestId) => {
    const identity = await requireMutationIdentity(request);
    const { categoryId } = await params;
    return apiSuccess(await archiveCategory(identity, categoryId), { requestId });
  });
}
