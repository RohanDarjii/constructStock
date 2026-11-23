import { z } from "zod";
import { inviteMemberSchema, teamListSchema } from "@/modules/users/schemas/team";
import { inviteMember, listInvitations } from "@/modules/users/services/team-service";
import { requireIdentity } from "@/server/auth/authorize";
import { apiSuccess } from "@/server/http/api-response";
import { apiRoute, parseBody } from "@/server/http/auth-route";
import { requireMutationIdentity } from "@/server/http/authenticated-request";
import { AppError } from "@/shared/errors/app-error";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return apiRoute("users.invitations.list", async (requestId) => {
    const identity = await requireIdentity();
    const parsed = teamListSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", "Check the invitation filters.", 422, { fields: z.flattenError(parsed.error).fieldErrors });
    const result = await listInvitations(identity, parsed.data);
    return apiSuccess(result.invitations, { requestId, pagination: result.pagination });
  });
}

export async function POST(request: Request): Promise<Response> {
  return apiRoute("users.invitations.create", async (requestId) => {
    const identity = await requireMutationIdentity(request);
    return apiSuccess(await inviteMember(identity, await parseBody(request, inviteMemberSchema)), { requestId }, 201);
  });
}
