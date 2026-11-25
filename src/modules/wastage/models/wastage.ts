import "server-only";
import mongoose, { type InferSchemaType, type Model, Schema } from "mongoose";
import { wastageReasons } from "../schemas/wastage";

const allocationSchema = new Schema({
  batchId: { type: Schema.Types.ObjectId, required: true, ref: "InventoryBatch" },
  quantity: { type: Schema.Types.Decimal128, required: true },
  unitCostSnapshot: { type: Schema.Types.Decimal128, required: true },
  valueRemoved: { type: Schema.Types.Decimal128, required: true },
  transactionId: { type: Schema.Types.ObjectId, required: true, ref: "InventoryTransaction" },
}, { _id: false });

const wastageSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
  siteId: { type: Schema.Types.ObjectId, required: true, ref: "Site" },
  materialId: { type: Schema.Types.ObjectId, required: true, ref: "Material" },
  wastageNumber: { type: String, required: true },
  quantity: { type: Schema.Types.Decimal128, required: true },
  wastedAt: { type: Date, required: true },
  reason: { type: String, enum: wastageReasons, required: true },
  activity: { type: String, default: null },
  notes: { type: String, default: null },
  allocationMethod: { type: String, enum: ["FIFO", "MANUAL"], required: true },
  overrideReason: { type: String, default: null },
  batchAllocations: { type: [allocationSchema], required: true },
  attachmentIds: { type: [{ type: Schema.Types.ObjectId, ref: "FileAttachment" }], default: [] },
  stockBefore: { type: Schema.Types.Decimal128, required: true },
  stockAfter: { type: Schema.Types.Decimal128, required: true },
  onHandBefore: { type: Schema.Types.Decimal128, required: true },
  onHandAfter: { type: Schema.Types.Decimal128, required: true },
  valueRemoved: { type: Schema.Types.Decimal128, required: true },
  createdBy: { type: Schema.Types.ObjectId, required: true, ref: "User" },
  status: { type: String, enum: ["CONFIRMED", "REVERSED"], default: "CONFIRMED", required: true },
  reversedAt: { type: Date, default: null },
  reversedBy: { type: Schema.Types.ObjectId, default: null, ref: "User" },
  reversalReason: { type: String, default: null },
  reversalValue: { type: Schema.Types.Decimal128, default: null },
}, { timestamps: { createdAt: true, updatedAt: false }, collection: "wastages" });

wastageSchema.index({ organizationId: 1, wastageNumber: 1 }, { unique: true });
wastageSchema.index({ organizationId: 1, siteId: 1, _id: -1 });
wastageSchema.index({ organizationId: 1, materialId: 1, wastedAt: -1 });

type WastageDocument = InferSchemaType<typeof wastageSchema>;
export const Wastage = (mongoose.models.Wastage as Model<WastageDocument> | undefined) ?? mongoose.model<WastageDocument>("Wastage", wastageSchema);
