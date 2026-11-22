import { loginSchema } from "@/modules/auth/schemas/auth";
import { login } from "@/modules/auth/services/auth-service";
import { setSessionCookie } from "@/server/auth/session";
import { apiSuccess } from "@/server/http/api-response";
import { assertAllowedOrigin, authRoute, clientIp, parseBody } from "@/server/http/auth-route";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return authRoute("auth.login", async (requestId) => {
    assertAllowedOrigin(request);
    const input = await parseBody(request, loginSchema);
    const { sessionToken, identity } = await login(input, clientIp(request), request.headers.get("user-agent")?.slice(0, 250) ?? null);
    await setSessionCookie(sessionToken);
    return apiSuccess({ user: identity.user, organization: identity.organization, membership: identity.membership, siteAssignments: identity.siteAssignments }, { requestId });
  });
}
