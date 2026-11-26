import { deleteUnlinkedAttachment, getAttachmentMetadata } from "@/modules/files/services/file-attachment-service";
import { requireIdentity } from "@/server/auth/authorize";
import { apiSuccess } from "@/server/http/api-response";
import { apiRoute } from "@/server/http/auth-route";
import { requireMutationIdentity } from "@/server/http/authenticated-request";

export const runtime = "nodejs";
type Context = { params: Promise<{ fileId: string }> };

export async function GET(_request: Request, context: Context): Promise<Response> {
  return apiRoute("files.get", async (requestId) => apiSuccess(await getAttachmentMetadata(await requireIdentity(), (await context.params).fileId), { requestId }));
}

export async function DELETE(request: Request, context: Context): Promise<Response> {
  return apiRoute("files.delete", async () => {
    await deleteUnlinkedAttachment(await requireMutationIdentity(request), (await context.params).fileId);
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  });
}
