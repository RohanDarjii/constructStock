import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { z } from "zod";
import { authorizeUploadToken } from "@/modules/files/services/file-attachment-service";
import { getBlobEnv } from "@/server/config/env";
import { apiRoute, parseBody } from "@/server/http/auth-route";
import { requireMutationIdentity } from "@/server/http/authenticated-request";
import { AppError } from "@/shared/errors/app-error";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return apiRoute("files.upload", async () => {
    const body = await parseBody(request, z.object({ type: z.enum(["blob.generate-client-token", "blob.upload-completed"]) }).passthrough()) as unknown as HandleUploadBody;
    const result = await handleUpload({
      request, body, token: getBlobEnv().BLOB_READ_WRITE_TOKEN,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const identity = await requireMutationIdentity(request);
        let attachmentId: string;
        try { attachmentId = (JSON.parse(clientPayload ?? "") as { attachmentId: string }).attachmentId; }
        catch { throw new AppError("VALIDATION_ERROR", "Upload metadata is missing.", 422); }
        return authorizeUploadToken(identity, attachmentId, pathname);
      },
      onUploadCompleted: async () => {},
    });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  });
}
