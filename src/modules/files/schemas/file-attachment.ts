import { z } from "zod";

export const maxWastagePhotoBytes = 10 * 1024 * 1024;
export const allowedPhotoMimeTypes = ["image/jpeg", "image/png", "image/webp"] as const;
export const createAttachmentSchema = z.object({
  siteId: z.string().regex(/^[a-fA-F0-9]{24}$/),
  fileName: z.string().trim().min(1).max(160).transform((value) => value.replace(/[\\/\x00-\x1f\x7f]/g, "_").trim()).refine((value) => value.length > 0),
  mimeType: z.enum(allowedPhotoMimeTypes),
  size: z.number().int().min(1).max(maxWastagePhotoBytes),
}).strict();
export type CreateAttachmentInput = z.output<typeof createAttachmentSchema>;
