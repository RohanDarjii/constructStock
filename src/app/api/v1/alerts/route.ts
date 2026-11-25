import { z } from "zod";
import { listAlertsSchema } from "@/modules/alerts/schemas/alert";
import { listAlerts } from "@/modules/alerts/services/stock-alert-service";
import { requireIdentity } from "@/server/auth/authorize";
import { apiSuccess } from "@/server/http/api-response";
import { apiRoute } from "@/server/http/auth-route";
import { AppError } from "@/shared/errors/app-error";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return apiRoute("alerts.list", async (requestId) => {
    const parsed = listAlertsSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", "Check the alert filters.", 422, { fields: z.flattenError(parsed.error).fieldErrors });
    const result = await listAlerts(await requireIdentity(), parsed.data);
    return apiSuccess({ records: result.alerts, summary: result.summary }, { requestId, pagination: result.pagination });
  });
}
