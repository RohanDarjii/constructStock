import { readPrivateAttachment } from "@/modules/files/services/file-attachment-service";
import { requireIdentity } from "@/server/auth/authorize";
import { apiRoute } from "@/server/http/auth-route";

export const runtime = "nodejs";
type Context = { params: Promise<{ fileId: string }> };

export async function GET(_request: Request, context: Context): Promise<Response> {
  return apiRoute("files.content", async () => {
    const file = await readPrivateAttachment(await requireIdentity(), (await context.params).fileId);
    const name = file.fileName.replace(/[^a-zA-Z0-9._ -]/g, "_").replace(/[\r\n]/g, "_");
    return new Response(file.stream, { headers: { "Content-Type": file.mimeType, "Content-Disposition": `${file.mimeType === "application/pdf" ? "attachment" : "inline"}; filename="${name}"`, "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store" } });
  });
}
