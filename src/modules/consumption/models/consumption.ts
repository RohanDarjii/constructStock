import "server-only";
import mongoose, { type InferSchemaType, type Model, Schema } from "mongoose";

const allocationSchema = new Schema({
  batchId: { type: Schema.Types.ObjectId, required: true, ref: "InventoryBatch" },
  quantity: { type: Schema.Types.Decimal128, required: true },
  unitCostSnapshot: { type: Schema.Types.Decimal128, required: true },
  valueRemoved: { type: Schema.Types.Decimal128, required: true },
  transactionId: { type: Schema.Types.ObjectId, required: true, ref: "InventoryTransaction" },
}, { _id: false });

const consumptionSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
  siteId: { type: Schema.Types.ObjectId, required: true, ref: "Site" },
  materialId: { type: Schema.Types.ObjectId, required: true, ref: "Material" },
  issueNumber: { type: String, required: true },
  quantity: { type: Schema.Types.Decimal128, required: true },
  issuedAt: { type: Date, required: true },
  activity: { type: String, required: true },
  issuedTo: { type: String, required: true },
  contractor: { type: String, default: null },
  description: { type: String, default: null },
  remarks: { type: String, default: null },
  allocationMethod: { type: String, enum: ["FIFO", "MANUAL"], required: true },
  overrideReason: { type: String, default: null },
  batchAllocations: { type: [allocationSchema], required: true },
  stockBefore: { type: Schema.Types.Decimal128, required: true },
  stockAfter: { type: Schema.Types.Decimal128, required: true },
  valueRemoved: { type: Schema.Types.Decimal128, required: true },
  createdBy: { type: Schema.Types.ObjectId, required: true, ref: "User" },
  status: { type: String, enum: ["CONFIRMED", "REVERSED"], default: "CONFIRMED", required: true },
  reversedAt: { type: Date, default: null },
  reversedBy: { type: Schema.Types.ObjectId, default: null, ref: "User" },
  reversalReason: { type: String, default: null },
  reversalValue: { type: Schema.Types.Decimal128, default: null },
}, { timestamps: { createdAt: true, updatedAt: false }, collection: "consumptions" });

consumptionSchema.index({ organizationId: 1, issueNumber: 1 }, { unique: true });
consumptionSchema.index({ organizationId: 1, siteId: 1, _id: -1 });
consumptionSchema.index({ organizationId: 1, materialId: 1, issuedAt: -1 });

type ConsumptionDocument = InferSchemaType<typeof consumptionSchema>;
export const Consumption = (mongoose.models.Consumption as Model<ConsumptionDocument> | undefined) ?? mongoose.model<ConsumptionDocument>("Consumption", consumptionSchema);
