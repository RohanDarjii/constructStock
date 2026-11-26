import { getReport } from "@/modules/reports/services/report-service";
import { parseReportQuery, parseSiteId } from "@/modules/reports/services/report-http";
import { reportQuerySchema } from "@/modules/reports/schemas/report";
import { requireIdentity } from "@/server/auth/authorize";
import { apiSuccess } from "@/server/http/api-response";
import { apiRoute } from "@/server/http/auth-route";

export const runtime = "nodejs";
type Context = { params: Promise<{ siteId: string }> };
export async function GET(request: Request, context: Context): Promise<Response> {
  return apiRoute("reports.site", async (requestId) => {
    const siteId = parseSiteId((await context.params).siteId);
    const query = reportQuerySchema.parse({ ...parseReportQuery(request.url, false), siteId });
    return apiSuccess(await getReport(await requireIdentity(), "sites", query), { requestId });
  });
}
