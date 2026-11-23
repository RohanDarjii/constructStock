import "server-only";
import mongoose, { type InferSchemaType, type Model, Schema } from "mongoose";

const batchSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
  siteId: { type: Schema.Types.ObjectId, required: true, ref: "Site" },
  materialId: { type: Schema.Types.ObjectId, required: true, ref: "Material" },
  batchCode: { type: String, required: true },
  supplierId: { type: Schema.Types.ObjectId, default: null, ref: "Supplier" },
  goodsReceiptId: { type: Schema.Types.ObjectId, default: null },
  sourceTransferId: { type: Schema.Types.ObjectId, default: null },
  sourceBatchId: { type: Schema.Types.ObjectId, default: null, ref: "InventoryBatch" },
  receivedAt: { type: Date, required: true },
  initialQuantity: { type: Schema.Types.Decimal128, required: true },
  remainingQuantity: { type: Schema.Types.Decimal128, required: true },
  reservedQuantity: { type: Schema.Types.Decimal128, required: true, default: () => mongoose.Types.Decimal128.fromString("0") },
  unitCost: { type: Schema.Types.Decimal128, required: true },
  status: { type: String, enum: ["ACTIVE", "DEPLETED", "QUARANTINED", "REVERSED"], default: "ACTIVE" },
  version: { type: Number, required: true, default: 0 },
}, { timestamps: true, collection: "inventory_batches" });

batchSchema.index({ organizationId: 1, siteId: 1, materialId: 1, receivedAt: 1, _id: 1 });
batchSchema.index({ organizationId: 1, siteId: 1, materialId: 1, status: 1, remainingQuantity: 1 });
batchSchema.index({ organizationId: 1, batchCode: 1 }, { unique: true });

type BatchDocument = InferSchemaType<typeof batchSchema>;
export const InventoryBatch = (mongoose.models.InventoryBatch as Model<BatchDocument> | undefined) ?? mongoose.model<BatchDocument>("InventoryBatch", batchSchema);
