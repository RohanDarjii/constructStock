import { z } from "zod";

const id = z.string().regex(/^[a-fA-F0-9]{24}$/);
const optionalId = z.union([id, z.literal("")]).transform((value) => value || undefined).optional();
const optionalDate = z.union([z.iso.date(), z.literal("")]).transform((value) => value || undefined).optional();

export const reportKinds = ["inventory", "purchases", "consumption", "wastage", "suppliers", "sites"] as const;
export const reportKindSchema = z.enum(reportKinds);
export const reportQuerySchema = z.object({
  from: optionalDate,
  to: optionalDate,
  siteId: optionalId,
  materialId: optionalId,
  categoryId: optionalId,
  supplierId: optionalId,
}).strict();
export const exportQuerySchema = reportQuerySchema.extend({ format: z.enum(["pdf", "xlsx"]) });
export type ReportKind = z.infer<typeof reportKindSchema>;
export type ReportQuery = z.output<typeof reportQuerySchema>;
