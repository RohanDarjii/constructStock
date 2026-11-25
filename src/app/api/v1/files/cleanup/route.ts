import { cleanupStaleUnlinkedAttachments } from "@/modules/files/services/file-attachment-service";
import { apiSuccess } from "@/server/http/api-response";
import { apiRoute } from "@/server/http/auth-route";
import { AppError } from "@/shared/errors/app-error";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
  return apiRoute("files.cleanup", async (requestId) => {
    const secret = process.env.CRON_SECRET;
    if (!secret || secret.length < 32 || request.headers.get("authorization") !== `Bearer ${secret}`) throw new AppError("UNAUTHORIZED", "Unauthorized.", 401);
    return apiSuccess(await cleanupStaleUnlinkedAttachments(), { requestId });
  });
}
