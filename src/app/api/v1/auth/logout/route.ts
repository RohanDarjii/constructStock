import { logout } from "@/modules/auth/services/auth-service";
import { verifyCsrf } from "@/modules/auth/services/security";
import { clearSessionCookie, currentIdentity, sessionTokenFromCookie } from "@/server/auth/session";
import { apiSuccess } from "@/server/http/api-response";
import { assertAllowedOrigin, authRoute } from "@/server/http/auth-route";
import { AppError } from "@/shared/errors/app-error";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return authRoute("auth.logout", async (requestId) => {
    assertAllowedOrigin(request);
    const identity = await currentIdentity();
    const token = await sessionTokenFromCookie();
    if (!identity || !token) throw new AppError("UNAUTHENTICATED", "Sign in to continue.", 401);
    verifyCsrf(token, request.headers.get("x-csrf-token"));
    await logout(token);
    await clearSessionCookie();
    return apiSuccess({ signedOut: true }, { requestId });
  });
}
