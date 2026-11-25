import { resetPasswordSchema } from "@/modules/auth/schemas/auth";
import { resetPassword } from "@/modules/auth/services/password-reset-service";
import { clearSessionCookie } from "@/server/auth/session";
import { apiSuccess } from "@/server/http/api-response";
import { assertAllowedOrigin, authRoute, clientIp, parseBody } from "@/server/http/auth-route";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return authRoute("auth.reset-password", async (requestId) => {
    assertAllowedOrigin(request);
    const input = await parseBody(request, resetPasswordSchema);
    await resetPassword(input, clientIp(request));
    await clearSessionCookie();
    return apiSuccess({ passwordReset: true }, { requestId });
  });
}
