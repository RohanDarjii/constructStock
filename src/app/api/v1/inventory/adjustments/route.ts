import { adjustmentSchema } from "@/modules/inventory/schemas/inventory";
import { createAdjustment } from "@/modules/inventory/services/inventory-adjustment-service";
import { apiSuccess } from "@/server/http/api-response";
import { apiRoute, parseBody } from "@/server/http/auth-route";
import { requireMutationIdentity } from "@/server/http/authenticated-request";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return apiRoute("inventory.adjustments.create", async (requestId) => {
    const identity = await requireMutationIdentity(request);
    const input = await parseBody(request, adjustmentSchema);
    return apiSuccess(await createAdjustment(identity, input, request.headers.get("Idempotency-Key") ?? ""), { requestId }, 201);
  });
}
