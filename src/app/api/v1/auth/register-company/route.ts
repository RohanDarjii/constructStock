import { registerCompanySchema } from "@/modules/auth/schemas/auth";
import { registerCompany } from "@/modules/auth/services/auth-service";
import { apiSuccess } from "@/server/http/api-response";
import { assertAllowedOrigin, authRoute, clientIp, parseBody } from "@/server/http/auth-route";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return authRoute("auth.register-company", async (requestId) => {
    assertAllowedOrigin(request);
    const input = await parseBody(request, registerCompanySchema);
    return apiSuccess(await registerCompany(input, clientIp(request)), { requestId }, 201);
  });
}
