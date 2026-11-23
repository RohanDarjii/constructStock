import "server-only";
import mongoose, { type InferSchemaType, type Model, Schema } from "mongoose";

const allocationSchema = new Schema({
  batchId: { type: Schema.Types.ObjectId, required: true, ref: "InventoryBatch" },
  quantity: { type: Schema.Types.Decimal128, required: true },
  unitCostSnapshot: { type: Schema.Types.Decimal128, required: true },
}, { _id: false });

const adjustmentSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
  siteId: { type: Schema.Types.ObjectId, required: true, ref: "Site" },
  materialId: { type: Schema.Types.ObjectId, required: true, ref: "Material" },
  direction: { type: String, enum: ["IN", "OUT"], required: true },
  quantity: { type: Schema.Types.Decimal128, required: true },
  reasonCode: { type: String, enum: ["OPENING_STOCK", "PHYSICAL_COUNT_CORRECTION", "OTHER"], required: true },
  remarks: { type: String, required: true },
  unitCost: { type: Schema.Types.Decimal128, default: null },
  batchAllocations: { type: [allocationSchema], default: [] },
  createdBy: { type: Schema.Types.ObjectId, required: true, ref: "User" },
}, { timestamps: true, collection: "inventory_adjustments" });

adjustmentSchema.index({ organizationId: 1, siteId: 1, createdAt: -1 });

type AdjustmentDocument = InferSchemaType<typeof adjustmentSchema>;
export const InventoryAdjustment = (mongoose.models.InventoryAdjustment as Model<AdjustmentDocument> | undefined) ?? mongoose.model<AdjustmentDocument>("InventoryAdjustment", adjustmentSchema);
