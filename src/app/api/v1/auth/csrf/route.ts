import { currentIdentity, sessionTokenFromCookie } from "@/server/auth/session";
import { csrfToken } from "@/modules/auth/services/security";
import { apiSuccess } from "@/server/http/api-response";
import { authRoute } from "@/server/http/auth-route";
import { AppError } from "@/shared/errors/app-error";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  return authRoute("auth.csrf", async (requestId) => {
    const identity = await currentIdentity();
    const token = await sessionTokenFromCookie();
    if (!identity || !token) throw new AppError("UNAUTHENTICATED", "Sign in to continue.", 401);
    return apiSuccess({ token: csrfToken(token) }, { requestId });
  });
}
