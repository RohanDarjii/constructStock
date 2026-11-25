import { finalizeAttachment } from "@/modules/files/services/file-attachment-service";
import { apiSuccess } from "@/server/http/api-response";
import { apiRoute } from "@/server/http/auth-route";
import { requireMutationIdentity } from "@/server/http/authenticated-request";

export const runtime = "nodejs";
type Context = { params: Promise<{ fileId: string }> };

export async function POST(request: Request, context: Context): Promise<Response> {
  return apiRoute("files.finalize", async (requestId) => apiSuccess(await finalizeAttachment(await requireMutationIdentity(request), (await context.params).fileId), { requestId }));
}
