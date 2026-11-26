import { dashboardQuerySchema } from "@/modules/dashboard/schemas/dashboard";
import { getDashboard } from "@/modules/dashboard/services/dashboard-service";
import { requireIdentity } from "@/server/auth/authorize";
import { apiSuccess } from "@/server/http/api-response";
import { apiRoute } from "@/server/http/auth-route";
import { AppError } from "@/shared/errors/app-error";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return apiRoute("dashboard.list", async (requestId) => {
    const parsed = dashboardQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", "Choose valid dashboard filters.", 422);
    const identity = await requireIdentity();
    return apiSuccess(await getDashboard(identity, parsed.data), { requestId });
  });
}
