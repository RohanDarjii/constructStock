import Decimal from "decimal.js";
import { z } from "zod";

const objectId = z.string().regex(/^[a-fA-F0-9]{24}$/);
const quantity = z.string().trim().regex(/^\d{1,16}(?:\.\d{1,3})?$/)
  .refine((value) => new Decimal(value).gt(0), "Quantity must be positive.")
  .transform((value) => new Decimal(value).toString());

export const transferStatuses = ["REQUESTED", "APPROVED", "DISPATCHED", "RECEIVED", "REJECTED", "CANCELLED"] as const;
export const transferReasons = ["SITE_SHORTAGE", "SURPLUS_REALLOCATION", "SCHEDULE_CHANGE", "OTHER"] as const;
export const transferReasonLabels: Record<typeof transferReasons[number], string> = {
  SITE_SHORTAGE: "Site shortage", SURPLUS_REALLOCATION: "Surplus reallocation", SCHEDULE_CHANGE: "Schedule change", OTHER: "Other",
};

export const createTransferSchema = z.object({
  sourceSiteId: objectId, destinationSiteId: objectId, materialId: objectId, quantity,
  targetDate: z.iso.date().optional(), reason: z.string().trim().min(3).max(500),
  purpose: z.string().trim().min(3).max(500).optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  remarks: z.string().trim().max(2000).nullable().optional(),
}).strict().refine((input) => input.sourceSiteId.toLowerCase() !== input.destinationSiteId.toLowerCase(), {
  path: ["destinationSiteId"], message: "Choose a different destination site.",
});

export const transferDecisionSchema = z.object({ reason: z.string().trim().min(8).max(500) }).strict();
export const transferActionSchema = z.object({}).strict();
export const listTransfersSchema = z.object({
  status: z.enum(transferStatuses).optional(), sourceSiteId: objectId.optional(), destinationSiteId: objectId.optional(),
  materialId: objectId.optional(), q: z.string().trim().max(80).optional(), cursor: objectId.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
}).strict();
export const transferOptionsSchema = z.object({ sourceSiteId: objectId.optional(), materialId: objectId.optional() }).strict();

export type CreateTransferInput = z.output<typeof createTransferSchema>;
export type ListTransfersQuery = z.output<typeof listTransfersSchema>;
export type TransferStatus = typeof transferStatuses[number];
