import { updateMaterialSchema } from "@/modules/materials/schemas/catalogue";
import { getMaterial, updateMaterial } from "@/modules/materials/services/material-service";
import { requireIdentity } from "@/server/auth/authorize";
import { apiSuccess } from "@/server/http/api-response";
import { apiRoute, parseBody } from "@/server/http/auth-route";
import { requireMutationIdentity } from "@/server/http/authenticated-request";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ materialId: string }> }): Promise<Response> {
  return apiRoute("materials.get", async (requestId) => {
    const identity = await requireIdentity();
    const { materialId } = await params;
    return apiSuccess(await getMaterial(identity, materialId), { requestId });
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ materialId: string }> }): Promise<Response> {
  return apiRoute("materials.update", async (requestId) => {
    const identity = await requireMutationIdentity(request);
    const input = await parseBody(request, updateMaterialSchema);
    const { materialId } = await params;
    return apiSuccess(await updateMaterial(identity, materialId, input), { requestId });
  });
}
