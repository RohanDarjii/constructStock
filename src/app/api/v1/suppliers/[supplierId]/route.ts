import { updateSupplierSchema } from "@/modules/suppliers/schemas/supplier";
import { getSupplier, updateSupplier } from "@/modules/suppliers/services/supplier-service";
import { requireIdentity } from "@/server/auth/authorize";
import { apiSuccess } from "@/server/http/api-response";
import { apiRoute, parseBody } from "@/server/http/auth-route";
import { requireMutationIdentity } from "@/server/http/authenticated-request";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ supplierId: string }> }): Promise<Response> {
  return apiRoute("suppliers.get", async (requestId) => {
    const identity = await requireIdentity();
    const { supplierId } = await params;
    return apiSuccess(await getSupplier(identity, supplierId), { requestId });
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ supplierId: string }> }): Promise<Response> {
  return apiRoute("suppliers.update", async (requestId) => {
    const identity = await requireMutationIdentity(request);
    const input = await parseBody(request, updateSupplierSchema);
    const { supplierId } = await params;
    return apiSuccess(await updateSupplier(identity, supplierId, input), { requestId });
  });
}
