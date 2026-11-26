import "server-only";
import mongoose, { type InferSchemaType, type Model, Schema } from "mongoose";

const itemSchema = new Schema({
  purchaseOrderItemId: { type: Schema.Types.ObjectId, required: true },
  materialId: { type: Schema.Types.ObjectId, required: true, ref: "Material" },
  batchId: { type: Schema.Types.ObjectId, required: true, ref: "InventoryBatch" },
  transactionId: { type: Schema.Types.ObjectId, required: true, ref: "InventoryTransaction" },
  quantityReceived: { type: Schema.Types.Decimal128, required: true },
  supplierBatchNumber: { type: String, default: null },
  unitCost: { type: Schema.Types.Decimal128, required: true },
  netAmount: { type: Schema.Types.Decimal128, required: true },
}, { _id: false });

const receiptSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
  receiptNumber: { type: String, required: true },
  purchaseOrderId: { type: Schema.Types.ObjectId, required: true, ref: "PurchaseOrder" },
  siteId: { type: Schema.Types.ObjectId, required: true, ref: "Site" },
  supplierId: { type: Schema.Types.ObjectId, required: true, ref: "Supplier" },
  receivedAt: { type: Date, required: true },
  invoiceNumber: { type: String, default: null },
  deliveryChallanNumber: { type: String, default: null },
  notes: { type: String, default: null },
  attachmentIds: { type: [{ type: Schema.Types.ObjectId, ref: "FileAttachment" }], default: [] },
  items: { type: [itemSchema], required: true },
  netTotal: { type: Schema.Types.Decimal128, required: true },
  receivedBy: { type: Schema.Types.ObjectId, required: true, ref: "User" },
  status: { type: String, enum: ["CONFIRMED", "REVERSED"], required: true, default: "CONFIRMED" },
  reversedAt: { type: Date, default: null },
  reversedBy: { type: Schema.Types.ObjectId, default: null, ref: "User" },
  reversalReason: { type: String, default: null },
}, { timestamps: { createdAt: true, updatedAt: false }, collection: "goods_receipts" });

receiptSchema.index({ organizationId: 1, receiptNumber: 1 }, { unique: true });
receiptSchema.index({ organizationId: 1, purchaseOrderId: 1, receivedAt: -1 });
receiptSchema.index({ organizationId: 1, siteId: 1, _id: -1 });

type ReceiptDocument = InferSchemaType<typeof receiptSchema>;
export const GoodsReceipt = (mongoose.models.GoodsReceipt as Model<ReceiptDocument> | undefined) ?? mongoose.model<ReceiptDocument>("GoodsReceipt", receiptSchema);
