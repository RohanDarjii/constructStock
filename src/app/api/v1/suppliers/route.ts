import { z } from "zod";
import { createSupplierSchema, listSuppliersQuerySchema } from "@/modules/suppliers/schemas/supplier";
import { createSupplier, listSuppliers } from "@/modules/suppliers/services/supplier-service";
import { requireIdentity } from "@/server/auth/authorize";
import { apiSuccess } from "@/server/http/api-response";
import { apiRoute, parseBody } from "@/server/http/auth-route";
import { requireMutationIdentity } from "@/server/http/authenticated-request";
import { AppError } from "@/shared/errors/app-error";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return apiRoute("suppliers.list", async (requestId) => {
    const identity = await requireIdentity();
    const query = listSuppliersQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!query.success) throw new AppError("VALIDATION_ERROR", "Check the supplier filters.", 422, { fields: z.flattenError(query.error).fieldErrors });
    const result = await listSuppliers(identity, query.data);
    return apiSuccess(result.suppliers, { requestId, pagination: result.pagination });
  });
}

export async function POST(request: Request): Promise<Response> {
  return apiRoute("suppliers.create", async (requestId) => {
    const identity = await requireMutationIdentity(request);
    return apiSuccess(await createSupplier(identity, await parseBody(request, createSupplierSchema)), { requestId }, 201);
  });
}
