import { getAlert } from "@/modules/alerts/services/stock-alert-service";
import { apiRoute } from "@/server/http/auth-route";
import { requireMutationIdentity } from "@/server/http/authenticated-request";
import { AppError } from "@/shared/errors/app-error";

export const runtime = "nodejs";
type Context = { params: Promise<{ alertId: string }> };

export async function POST(request: Request, context: Context): Promise<Response> {
  return apiRoute("alerts.resolve", async () => {
    await getAlert(await requireMutationIdentity(request), (await context.params).alertId);
    throw new AppError("STOCK_ALERT_AUTO_RESOLVES", "Stock alerts resolve automatically when available stock rises above the minimum.", 409);
  });
}
