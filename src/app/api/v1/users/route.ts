import { z } from "zod";
import { teamListSchema } from "@/modules/users/schemas/team";
import { listTeamMembers } from "@/modules/users/services/team-service";
import { requireIdentity } from "@/server/auth/authorize";
import { apiSuccess } from "@/server/http/api-response";
import { apiRoute } from "@/server/http/auth-route";
import { AppError } from "@/shared/errors/app-error";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return apiRoute("users.list", async (requestId) => {
    const identity = await requireIdentity();
    const parsed = teamListSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", "Check the team filters.", 422, { fields: z.flattenError(parsed.error).fieldErrors });
    const result = await listTeamMembers(identity, parsed.data);
    return apiSuccess(result.members, { requestId, pagination: result.pagination });
  });
}
