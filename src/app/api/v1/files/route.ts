import { createAttachmentSchema } from "@/modules/files/schemas/file-attachment";
import { createPendingAttachment } from "@/modules/files/services/file-attachment-service";
import { apiSuccess } from "@/server/http/api-response";
import { apiRoute, parseBody } from "@/server/http/auth-route";
import { requireMutationIdentity } from "@/server/http/authenticated-request";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return apiRoute("files.create", async (requestId) => {
    const identity = await requireMutationIdentity(request);
    return apiSuccess(await createPendingAttachment(identity, await parseBody(request, createAttachmentSchema)), { requestId }, 201);
  });
}
