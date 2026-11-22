import { currentIdentity } from "@/server/auth/session";
import { apiSuccess } from "@/server/http/api-response";
import { authRoute } from "@/server/http/auth-route";
import { AppError } from "@/shared/errors/app-error";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  return authRoute("auth.me", async (requestId) => {
    const identity = await currentIdentity();
    if (!identity) throw new AppError("UNAUTHENTICATED", "Sign in to continue.", 401);
    return apiSuccess({ user: identity.user, organization: identity.organization, membership: identity.membership, siteAssignments: identity.siteAssignments }, { requestId });
  });
}
