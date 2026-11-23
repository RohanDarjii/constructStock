import { archiveSupplier } from "@/modules/suppliers/services/supplier-service";
import { apiSuccess } from "@/server/http/api-response";
import { apiRoute } from "@/server/http/auth-route";
import { requireMutationIdentity } from "@/server/http/authenticated-request";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ supplierId: string }> }): Promise<Response> {
  return apiRoute("suppliers.archive", async (requestId) => {
    const identity = await requireMutationIdentity(request);
    const { supplierId } = await params;
    return apiSuccess(await archiveSupplier(identity, supplierId), { requestId });
  });
}
