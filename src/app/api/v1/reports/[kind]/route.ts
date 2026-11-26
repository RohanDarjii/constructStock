import { reportResponse } from "@/modules/reports/services/report-http";
import { apiRoute } from "@/server/http/auth-route";

export const runtime = "nodejs";
type Context = { params: Promise<{ kind: string }> };
export async function GET(request: Request, context: Context): Promise<Response> {
  return apiRoute("reports.get", async (requestId) => reportResponse(request, (await context.params).kind, requestId));
}
