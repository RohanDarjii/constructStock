import Decimal from "decimal.js";
import { z } from "zod";

const objectId = z.string().regex(/^[a-fA-F0-9]{24}$/);
const quantity = z.string().trim().regex(/^\d{1,16}(?:\.\d{1,3})?$/).refine((value) => new Decimal(value).gt(0), "Quantity must be positive.").transform((value) => new Decimal(value).toString());
const money = z.string().trim().regex(/^\d{1,16}(?:\.\d{1,2})?$/).transform((value) => new Decimal(value).toFixed(2));
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

export const createGoodsReceiptSchema = z.object({
  purchaseOrderId: objectId,
  receivedAt: z.iso.datetime({ offset: true }),
  invoiceNumber: optionalText(100),
  deliveryChallanNumber: optionalText(100),
  notes: optionalText(2000),
  items: z.array(z.object({
    purchaseOrderItemId: objectId,
    materialId: objectId,
    quantityReceived: quantity,
    supplierBatchNumber: optionalText(100),
    unitCost: money,
  }).strict()).min(1).max(30),
}).strict();

export const reverseGoodsReceiptSchema = z.object({ reason: z.string().trim().min(8).max(500) }).strict();
export const goodsReceiptIdSchema = objectId;
export const listGoodsReceiptsSchema = z.object({
  siteId: objectId.optional(), supplierId: objectId.optional(), purchaseOrderId: objectId.optional(),
  status: z.enum(["CONFIRMED", "REVERSED"]).optional(),
  q: z.string().trim().max(80).optional(), cursor: objectId.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
}).strict();

export type CreateGoodsReceiptInput = z.output<typeof createGoodsReceiptSchema>;
export type ListGoodsReceiptsQuery = z.output<typeof listGoodsReceiptsSchema>;
