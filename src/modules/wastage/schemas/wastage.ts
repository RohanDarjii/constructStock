import Decimal from "decimal.js";
import { z } from "zod";

const objectId = z.string().regex(/^[a-fA-F0-9]{24}$/);
const quantity = z.string().trim().regex(/^\d{1,16}(?:\.\d{1,3})?$/)
  .refine((value) => new Decimal(value).gt(0), "Quantity must be positive.")
  .transform((value) => new Decimal(value).toString());
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

export const wastageReasons = ["BREAKAGE", "DAMAGE", "TRANSPORT", "STORAGE", "EXCESS_USAGE", "THEFT_LOSS", "WEATHER", "QUALITY_REJECTION", "OTHER"] as const;
export const wastageReasonLabels: Record<typeof wastageReasons[number], string> = {
  BREAKAGE: "Breakage", DAMAGE: "Damage", TRANSPORT: "Transportation damage", STORAGE: "Improper storage",
  EXCESS_USAGE: "Excess usage", THEFT_LOSS: "Theft / loss", WEATHER: "Weather damage",
  QUALITY_REJECTION: "Quality rejection", OTHER: "Other",
};

export const createWastageSchema = z.object({
  siteId: objectId,
  materialId: objectId,
  quantity,
  wastedAt: z.iso.datetime({ offset: true }),
  reason: z.enum(wastageReasons),
  activity: optionalText(120),
  notes: optionalText(2000),
  allocationMethod: z.enum(["FIFO", "MANUAL"]).default("FIFO"),
  batchAllocations: z.array(z.object({ batchId: objectId, quantity }).strict()).min(1).max(100).optional(),
  overrideReason: optionalText(500),
  attachmentIds: z.array(objectId).max(1).default([]),
}).strict().superRefine((input, context) => {
  if (input.allocationMethod === "MANUAL") {
    if (!input.batchAllocations?.length) context.addIssue({ code: "custom", path: ["batchAllocations"], message: "Select batches for manual allocation." });
    if (!input.overrideReason || input.overrideReason.length < 8) context.addIssue({ code: "custom", path: ["overrideReason"], message: "Explain the manual batch selection." });
  } else if (input.batchAllocations || input.overrideReason) {
    context.addIssue({ code: "custom", path: ["allocationMethod"], message: "FIFO allocation is selected by the server." });
  }
});

export const reverseWastageSchema = z.object({ reason: z.string().trim().min(8).max(500) }).strict();
export const listWastagesSchema = z.object({
  siteId: objectId.optional(), materialId: objectId.optional(), reason: z.enum(wastageReasons).optional(),
  status: z.enum(["CONFIRMED", "REVERSED"]).optional(), q: z.string().trim().max(80).optional(),
  from: z.iso.date().optional(), to: z.iso.date().optional(), cursor: objectId.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
}).strict().refine((input) => !input.from || !input.to || input.from <= input.to, { path: ["to"], message: "End date must follow start date." });

export const wastageOptionsSchema = z.object({ siteId: objectId.optional(), materialId: objectId.optional() }).strict();
export type CreateWastageInput = z.output<typeof createWastageSchema>;
export type ListWastagesQuery = z.output<typeof listWastagesSchema>;
export type WastageReason = typeof wastageReasons[number];
