import Decimal from "decimal.js";
import { z } from "zod";

const objectId = z.string().regex(/^[a-fA-F0-9]{24}$/);
const quantity = z.string().trim().regex(/^\d{1,16}(?:\.\d{1,3})?$/)
  .refine((value) => new Decimal(value).gt(0), "Quantity must be positive.")
  .transform((value) => new Decimal(value).toString());
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const allocation = z.object({ batchId: objectId, quantity }).strict();

export const createConsumptionSchema = z.object({
  siteId: objectId,
  materialId: objectId,
  quantity,
  issuedAt: z.iso.datetime({ offset: true }),
  activity: z.string().trim().min(2).max(120),
  issuedTo: z.string().trim().min(2).max(120),
  contractor: optionalText(120),
  description: optionalText(1000),
  remarks: optionalText(2000),
  allocationMethod: z.enum(["FIFO", "MANUAL"]).default("FIFO"),
  batchAllocations: z.array(allocation).min(1).max(100).optional(),
  overrideReason: optionalText(500),
}).strict().superRefine((input, context) => {
  if (input.allocationMethod === "MANUAL") {
    if (!input.batchAllocations?.length) context.addIssue({ code: "custom", path: ["batchAllocations"], message: "Select batches for manual allocation." });
    if (!input.overrideReason || input.overrideReason.length < 8) context.addIssue({ code: "custom", path: ["overrideReason"], message: "Explain the manual batch selection." });
  } else if (input.batchAllocations || input.overrideReason) {
    context.addIssue({ code: "custom", path: ["allocationMethod"], message: "FIFO allocation is selected by the server." });
  }
});

export const reverseConsumptionSchema = z.object({ reason: z.string().trim().min(8).max(500) }).strict();
export const listConsumptionsSchema = z.object({
  siteId: objectId.optional(), materialId: objectId.optional(),
  status: z.enum(["CONFIRMED", "REVERSED"]).optional(),
  q: z.string().trim().max(80).optional(),
  activity: z.string().trim().max(120).optional(),
  from: z.iso.date().optional(), to: z.iso.date().optional(),
  cursor: objectId.optional(), limit: z.coerce.number().int().min(1).max(100).default(25),
}).strict().refine((input) => !input.from || !input.to || input.from <= input.to, { path: ["to"], message: "End date must follow start date." });

export const issueOptionsSchema = z.object({ siteId: objectId.optional(), materialId: objectId.optional() }).strict();
export type CreateConsumptionInput = z.output<typeof createConsumptionSchema>;
export type ListConsumptionsQuery = z.output<typeof listConsumptionsSchema>;
