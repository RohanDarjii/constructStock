import { z } from "zod";

export const maxWastagePhotoBytes = 10 * 1024 * 1024;
export const maxReceiptDocumentBytes = 15 * 1024 * 1024;
export const allowedPhotoMimeTypes = ["image/jpeg", "image/png", "image/webp"] as const;
export const createAttachmentSchema = z.object({
  siteId: z.string().regex(/^[a-fA-F0-9]{24}$/),
  fileName: z.string().trim().min(1).max(160).transform((value) => value.replace(/[\\/\x00-\x1f\x7f]/g, "_").trim()).refine((value) => value.length > 0),
  purpose: z.enum(["WASTAGE_PHOTO", "INVOICE", "DELIVERY_CHALLAN"]).default("WASTAGE_PHOTO"),
  mimeType: z.enum([...allowedPhotoMimeTypes, "application/pdf"]),
  size: z.number().int().min(1).max(maxReceiptDocumentBytes),
}).strict().superRefine((value, context) => {
  if (value.size > (value.purpose === "WASTAGE_PHOTO" ? maxWastagePhotoBytes : maxReceiptDocumentBytes)) context.addIssue({ code: "custom", path: ["size"], message: "File is too large." });
  if (value.purpose === "WASTAGE_PHOTO" && value.mimeType === "application/pdf") context.addIssue({ code: "custom", path: ["mimeType"], message: "Evidence must be an image." });
  const extensions: Record<string, string[]> = { "image/jpeg": [".jpg", ".jpeg"], "image/png": [".png"], "image/webp": [".webp"], "application/pdf": [".pdf"] };
  if (!extensions[value.mimeType].some((extension) => value.fileName.toLowerCase().endsWith(extension))) context.addIssue({ code: "custom", path: ["fileName"], message: "File extension does not match its type." });
});
export type CreateAttachmentInput = z.input<typeof createAttachmentSchema>;
