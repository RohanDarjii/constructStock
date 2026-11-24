import "server-only";
import mongoose, { type InferSchemaType, type Model, Schema } from "mongoose";
import { purchaseOrderStatuses } from "../schemas/purchase-order";

const lineSchema = new Schema({
  materialId: { type: Schema.Types.ObjectId, required: true, ref: "Material" },
  unit: { type: String, required: true },
  quantityOrdered: { type: Schema.Types.Decimal128, required: true },
  quantityReceived: { type: Schema.Types.Decimal128, required: true, default: () => mongoose.Types.Decimal128.fromString("0") },
  unitPrice: { type: Schema.Types.Decimal128, required: true },
  taxRate: { type: Schema.Types.Decimal128, required: true },
  subtotal: { type: Schema.Types.Decimal128, required: true },
  taxTotal: { type: Schema.Types.Decimal128, required: true },
  grandTotal: { type: Schema.Types.Decimal128, required: true },
});

const approvalSchema = new Schema({
  submittedAt: { type: Date, default: null }, submittedBy: { type: Schema.Types.ObjectId, default: null, ref: "User" },
  approvedAt: { type: Date, default: null }, approvedBy: { type: Schema.Types.ObjectId, default: null, ref: "User" },
  approvalRemarks: { type: String, default: null },
  rejectedAt: { type: Date, default: null }, rejectedBy: { type: Schema.Types.ObjectId, default: null, ref: "User" },
  rejectionRemarks: { type: String, default: null },
}, { _id: false });

const purchaseOrderSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
  siteId: { type: Schema.Types.ObjectId, required: true, ref: "Site" },
  supplierId: { type: Schema.Types.ObjectId, required: true, ref: "Supplier" },
  poNumber: { type: String, required: true },
  status: { type: String, enum: purchaseOrderStatuses, required: true, default: "DRAFT" },
  currencyCode: { type: String, required: true },
  items: { type: [lineSchema], required: true },
  subtotal: { type: Schema.Types.Decimal128, required: true },
  taxTotal: { type: Schema.Types.Decimal128, required: true },
  grandTotal: { type: Schema.Types.Decimal128, required: true },
  approval: { type: approvalSchema, required: true, default: () => ({}) },
  expectedDeliveryDate: { type: Date, default: null },
  notes: { type: String, default: null },
  orderedAt: { type: Date, default: null }, orderedBy: { type: Schema.Types.ObjectId, default: null, ref: "User" },
  cancelledAt: { type: Date, default: null }, cancelledBy: { type: Schema.Types.ObjectId, default: null, ref: "User" },
  cancellationRemarks: { type: String, default: null },
  createdBy: { type: Schema.Types.ObjectId, required: true, ref: "User" },
}, { timestamps: true, collection: "purchase_orders", optimisticConcurrency: true });

purchaseOrderSchema.index({ organizationId: 1, poNumber: 1 }, { unique: true });
purchaseOrderSchema.index({ organizationId: 1, siteId: 1, status: 1, _id: -1 });
purchaseOrderSchema.index({ organizationId: 1, supplierId: 1, status: 1 });

type PurchaseOrderDocument = InferSchemaType<typeof purchaseOrderSchema>;
export const PurchaseOrder = (mongoose.models.PurchaseOrder as Model<PurchaseOrderDocument> | undefined) ?? mongoose.model<PurchaseOrderDocument>("PurchaseOrder", purchaseOrderSchema);
