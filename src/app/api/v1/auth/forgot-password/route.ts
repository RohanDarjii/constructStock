import { after } from "next/server";
import { forgotPasswordSchema } from "@/modules/auth/schemas/auth";
import { requestPasswordReset } from "@/modules/auth/services/password-reset-service";
import { apiSuccess } from "@/server/http/api-response";
import { assertAllowedOrigin, authRoute, clientIp, parseBody } from "@/server/http/auth-route";

export const runtime = "nodejs";
export const maxDuration = 20;

export async function POST(request: Request): Promise<Response> {
  return authRoute("auth.forgot-password", async (requestId) => {
    assertAllowedOrigin(request);
    const input = await parseBody(request, forgotPasswordSchema);
    const deliver = await requestPasswordReset(input, clientIp(request));
    if (deliver) after(deliver);
    return apiSuccess({ message: "If an active account uses that address, check its inbox for a reset link." }, { requestId });
  });
}
