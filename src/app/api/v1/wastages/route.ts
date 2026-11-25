import { z } from "zod";
import { createWastageSchema, listWastagesSchema } from "@/modules/wastage/schemas/wastage";
import { createWastage, listWastages } from "@/modules/wastage/services/wastage-service";
import { requireIdentity } from "@/server/auth/authorize";
import { apiSuccess } from "@/server/http/api-response";
import { apiRoute, parseBody } from "@/server/http/auth-route";
import { requireMutationIdentity } from "@/server/http/authenticated-request";
import { AppError } from "@/shared/errors/app-error";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return apiRoute("wastages.list", async (requestId) => {
    const parsed = listWastagesSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", "Check the wastage filters.", 422, { fields: z.flattenError(parsed.error).fieldErrors });
    const result = await listWastages(await requireIdentity(), parsed.data);
    return apiSuccess({ records: result.wastages, summary: result.summary }, { requestId, pagination: result.pagination });
  });
}

export async function POST(request: Request): Promise<Response> {
  return apiRoute("wastages.create", async (requestId) => {
    const identity = await requireMutationIdentity(request);
    const input = await parseBody(request, createWastageSchema);
    return apiSuccess(await createWastage(identity, input, request.headers.get("Idempotency-Key") ?? ""), { requestId }, 201);
  });
}
