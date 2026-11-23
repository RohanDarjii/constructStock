import "server-only";
import mongoose, { type InferSchemaType, type Model, Schema } from "mongoose";

export const inventoryTransactionTypes = ["RECEIPT", "CONSUMPTION", "WASTAGE", "TRANSFER_RESERVE", "TRANSFER_RESERVE_RELEASE", "TRANSFER_OUT", "TRANSFER_IN", "ADJUSTMENT_IN", "ADJUSTMENT_OUT", "REVERSAL"] as const;

const transactionSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
  siteId: { type: Schema.Types.ObjectId, required: true, ref: "Site" },
  materialId: { type: Schema.Types.ObjectId, required: true, ref: "Material" },
  batchId: { type: Schema.Types.ObjectId, default: null, ref: "InventoryBatch" },
  type: { type: String, enum: inventoryTransactionTypes, required: true },
  quantity: { type: Schema.Types.Decimal128, required: true },
  unitCost: { type: Schema.Types.Decimal128, default: null },
  referenceType: { type: String, enum: ["ADJUSTMENT", "GOODS_RECEIPT", "CONSUMPTION", "WASTAGE", "TRANSFER", "REVERSAL"], required: true },
  referenceId: { type: Schema.Types.ObjectId, required: true },
  reversalOfTransactionId: { type: Schema.Types.ObjectId, default: null, ref: "InventoryTransaction" },
  performedBy: { type: Schema.Types.ObjectId, required: true, ref: "User" },
  createdAt: { type: Date, default: Date.now, immutable: true },
}, { collection: "inventory_transactions" });

transactionSchema.index({ organizationId: 1, siteId: 1, materialId: 1, createdAt: -1, _id: -1 });
transactionSchema.index({ organizationId: 1, referenceType: 1, referenceId: 1 });

type TransactionDocument = InferSchemaType<typeof transactionSchema>;
export const InventoryTransaction = (mongoose.models.InventoryTransaction as Model<TransactionDocument> | undefined) ?? mongoose.model<TransactionDocument>("InventoryTransaction", transactionSchema);
