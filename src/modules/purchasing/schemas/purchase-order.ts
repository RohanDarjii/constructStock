import Decimal from "decimal.js";
import { z } from "zod";

const objectId = z.string().regex(/^[a-fA-F0-9]{24}$/);
const quantity = z.string().trim().regex(/^\d{1,16}(?:\.\d{1,3})?$/).refine((value) => new Decimal(value).gt(0), "Quantity must be positive.").transform((value) => new Decimal(value).toString());
const money = z.string().trim().regex(/^\d{1,16}(?:\.\d{1,2})?$/).transform((value) => new Decimal(value).toFixed(2));
const taxRate = z.string().trim().regex(/^\d{1,3}(?:\.\d{1,4})?$/).refine((value) => new Decimal(value).lte(100), "Tax rate cannot exceed 100%.").transform((value) => new Decimal(value).toFixed(4));
const dateOnly = z.iso.date().refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)), "Use a valid date.");

const item = z.object({ materialId: objectId, quantityOrdered: quantity, unitPrice: money, taxRate }).strict();
const fields = z.object({
  siteId: objectId,
  supplierId: objectId,
  expectedDeliveryDate: dateOnly.nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  items: z.array(item).min(1).max(30),
}).strict();

function uniqueMaterials(input: { items?: Array<{ materialId: string }> }) {
  return !input.items || new Set(input.items.map((line) => line.materialId.toLowerCase())).size === input.items.length;
}

export const createPurchaseOrderSchema = fields.refine(uniqueMaterials, { path: ["items"], message: "Add each material only once." });
export const updatePurchaseOrderSchema = fields.partial().refine((input) => Object.keys(input).length > 0, "Provide a field to update.").refine(uniqueMaterials, { path: ["items"], message: "Add each material only once." });
export const purchaseOrderRemarksSchema = z.object({ remarks: z.string().trim().max(500).optional() }).strict();
export const purchaseOrderReasonSchema = z.object({ remarks: z.string().trim().min(8).max(500) }).strict();
export const purchaseOrderIdSchema = objectId;
export const purchaseOrderStatuses = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "REJECTED", "ORDERED", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"] as const;
const optionalFilterId = z.union([objectId, z.literal("")]).transform((value) => value || undefined).optional();
export const listPurchaseOrdersSchema = z.object({
  status: z.union([z.enum(purchaseOrderStatuses), z.literal("")]).transform((value) => value || undefined).optional(),
  siteId: optionalFilterId,
  supplierId: optionalFilterId,
  q: z.string().trim().max(80).optional(),
  cursor: objectId.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
}).strict();

export type CreatePurchaseOrderInput = z.output<typeof createPurchaseOrderSchema>;
export type UpdatePurchaseOrderInput = z.output<typeof updatePurchaseOrderSchema>;
export type ListPurchaseOrdersQuery = z.output<typeof listPurchaseOrdersSchema>;
export type PurchaseOrderStatus = typeof purchaseOrderStatuses[number];
