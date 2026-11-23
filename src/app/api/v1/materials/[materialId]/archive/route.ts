import { archiveMaterial } from "@/modules/materials/services/material-service";
import { apiSuccess } from "@/server/http/api-response";
import { apiRoute } from "@/server/http/auth-route";
import { requireMutationIdentity } from "@/server/http/authenticated-request";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ materialId: string }> }): Promise<Response> {
  return apiRoute("materials.archive", async (requestId) => {
    const identity = await requireMutationIdentity(request);
    const { materialId } = await params;
    return apiSuccess(await archiveMaterial(identity, materialId), { requestId });
  });
}
