import { exportResponse, parseSiteId } from "@/modules/reports/services/report-http";
import { apiRoute } from "@/server/http/auth-route";

export const runtime = "nodejs";
type Context = { params: Promise<{ siteId: string }> };
export async function GET(request: Request, context: Context): Promise<Response> {
  return apiRoute("reports.site.export", async () => {
    const siteId = parseSiteId((await context.params).siteId);
    const url = new URL(request.url);
    url.searchParams.set("siteId", siteId);
    return exportResponse(new Request(url, request), "sites");
  });
}
