import Decimal from "decimal.js";
import { z } from "zod";

const objectId = z.string().regex(/^[a-fA-F0-9]{24}$/);
const quantity = z.string().trim().regex(/^\d{1,16}(?:\.\d{1,3})?$/).refine((value) => new Decimal(value).gt(0), "Quantity must be positive.").transform((value) => new Decimal(value).toString());
const money = z.string().trim().regex(/^\d{1,16}(?:\.\d{1,2})?$/).transform((value) => new Decimal(value).toFixed(2));
const page = { cursor: objectId.optional(), limit: z.coerce.number().int().min(1).max(100).default(25) };

export const balanceQuerySchema = z.object({ ...page, siteId: objectId.optional(), materialId: objectId.optional(), lowStock: z.enum(["true", "false"]).optional() }).strict();
export const batchQuerySchema = z.object({ ...page, siteId: objectId.optional(), materialId: objectId.optional() }).strict();
export const transactionQuerySchema = z.object({ ...page, siteId: objectId.optional(), materialId: objectId.optional() }).strict();

export const adjustmentSchema = z.object({
  siteId: objectId,
  materialId: objectId,
  direction: z.enum(["IN", "OUT"]),
  quantity,
  reasonCode: z.enum(["OPENING_STOCK", "PHYSICAL_COUNT_CORRECTION", "OTHER"]),
  remarks: z.string().trim().min(8).max(500),
  unitCost: money.optional(),
  batchId: objectId.optional(),
}).strict().superRefine((input, context) => {
  if (input.direction === "IN" && input.unitCost === undefined) context.addIssue({ code: "custom", path: ["unitCost"], message: "Unit cost is required when adding stock." });
  if (input.direction === "IN" && input.batchId) context.addIssue({ code: "custom", path: ["batchId"], message: "Incoming stock creates a new batch." });
  if (input.direction === "OUT" && input.unitCost !== undefined) context.addIssue({ code: "custom", path: ["unitCost"], message: "Outgoing stock uses the batch cost." });
  if (input.direction === "OUT" && input.reasonCode === "OPENING_STOCK") context.addIssue({ code: "custom", path: ["reasonCode"], message: "Opening stock must add inventory." });
});

export type BalanceQuery = z.output<typeof balanceQuerySchema>;
export type BatchQuery = z.output<typeof batchQuerySchema>;
export type TransactionQuery = z.output<typeof transactionQuerySchema>;
export type AdjustmentInput = z.output<typeof adjustmentSchema>;
