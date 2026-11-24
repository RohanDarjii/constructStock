import { z } from "zod";
import { createConsumptionSchema, listConsumptionsSchema } from "@/modules/consumption/schemas/consumption";
import { createConsumption, listConsumptions } from "@/modules/consumption/services/consumption-service";
import { requireIdentity } from "@/server/auth/authorize";
import { apiSuccess } from "@/server/http/api-response";
import { apiRoute, parseBody } from "@/server/http/auth-route";
import { requireMutationIdentity } from "@/server/http/authenticated-request";
import { AppError } from "@/shared/errors/app-error";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return apiRoute("consumptions.list", async (requestId) => {
    const parsed = listConsumptionsSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", "Check the issue filters.", 422, { fields: z.flattenError(parsed.error).fieldErrors });
    const result = await listConsumptions(await requireIdentity(), parsed.data);
    return apiSuccess(result.consumptions, { requestId, pagination: result.pagination });
  });
}

export async function POST(request: Request): Promise<Response> {
  return apiRoute("consumptions.create", async (requestId) => {
    const identity = await requireMutationIdentity(request);
    const input = await parseBody(request, createConsumptionSchema);
    return apiSuccess(await createConsumption(identity, input, request.headers.get("Idempotency-Key") ?? ""), { requestId }, 201);
  });
}
