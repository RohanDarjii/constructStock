import "server-only";
import mongoose, { type InferSchemaType, type Model, Schema } from "mongoose";
import { transferStatuses } from "../schemas/transfer";

const allocationSchema = new Schema({
  batchId: { type: Schema.Types.ObjectId, required: true, ref: "InventoryBatch" },
  destinationBatchId: { type: Schema.Types.ObjectId, default: null, ref: "InventoryBatch" },
  quantity: { type: Schema.Types.Decimal128, required: true },
  unitCostSnapshot: { type: Schema.Types.Decimal128, required: true },
  valueRemoved: { type: Schema.Types.Decimal128, required: true },
}, { _id: false });

const transferSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
  sourceSiteId: { type: Schema.Types.ObjectId, required: true, ref: "Site" },
  destinationSiteId: { type: Schema.Types.ObjectId, required: true, ref: "Site" },
  materialId: { type: Schema.Types.ObjectId, required: true, ref: "Material" },
  transferNumber: { type: String, required: true },
  quantity: { type: Schema.Types.Decimal128, required: true },
  targetDate: { type: Date, default: null },
  reason: { type: String, required: true },
  purpose: { type: String, required: true },
  notes: { type: String, default: null },
  status: { type: String, enum: transferStatuses, required: true, default: "REQUESTED" },
  allocations: { type: [allocationSchema], default: [] },
  inTransitQuantity: { type: Schema.Types.Decimal128, required: true, default: () => mongoose.Types.Decimal128.fromString("0") },
  inTransitValue: { type: Schema.Types.Decimal128, required: true, default: () => mongoose.Types.Decimal128.fromString("0") },
  transferValue: { type: Schema.Types.Decimal128, required: true, default: () => mongoose.Types.Decimal128.fromString("0") },
  receiptValue: { type: Schema.Types.Decimal128, required: true, default: () => mongoose.Types.Decimal128.fromString("0") },
  roundingVariance: { type: Schema.Types.Decimal128, required: true, default: () => mongoose.Types.Decimal128.fromString("0") },
  requestedBy: { type: Schema.Types.ObjectId, required: true, ref: "User" },
  requestedAt: { type: Date, required: true },
  approvedBy: { type: Schema.Types.ObjectId, default: null, ref: "User" }, approvedAt: { type: Date, default: null },
  dispatchedBy: { type: Schema.Types.ObjectId, default: null, ref: "User" }, dispatchedAt: { type: Date, default: null },
  receivedBy: { type: Schema.Types.ObjectId, default: null, ref: "User" }, receivedAt: { type: Date, default: null },
  closedBy: { type: Schema.Types.ObjectId, default: null, ref: "User" }, closedAt: { type: Date, default: null },
  closureReason: { type: String, default: null },
}, { timestamps: true, collection: "transfers" });

transferSchema.index({ organizationId: 1, transferNumber: 1 }, { unique: true });
transferSchema.index({ organizationId: 1, sourceSiteId: 1, status: 1, _id: -1 });
transferSchema.index({ organizationId: 1, destinationSiteId: 1, status: 1, _id: -1 });
transferSchema.index({ organizationId: 1, materialId: 1, status: 1 });

type TransferDocument = InferSchemaType<typeof transferSchema>;
export const Transfer = (mongoose.models.Transfer as Model<TransferDocument> | undefined) ?? mongoose.model<TransferDocument>("Transfer", transferSchema);
