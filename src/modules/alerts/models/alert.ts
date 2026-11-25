import "server-only";
import mongoose, { type InferSchemaType, type Model, Schema } from "mongoose";
import { alertStatuses, stockAlertTypes } from "../schemas/alert";

const eventSchema = new Schema({
  event: { type: String, enum: ["TRIGGERED", "ESCALATED", "DEESCALATED", "ACKNOWLEDGED", "RESOLVED"], required: true },
  at: { type: Date, required: true },
  actorUserId: { type: Schema.Types.ObjectId, default: null, ref: "User" },
  note: { type: String, default: null },
  availableQuantity: { type: Schema.Types.Decimal128, required: true },
  minimumQuantity: { type: Schema.Types.Decimal128, required: true },
}, { _id: false });

const alertSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
  siteId: { type: Schema.Types.ObjectId, required: true, ref: "Site" },
  materialId: { type: Schema.Types.ObjectId, required: true, ref: "Material" },
  conditionKey: { type: String, required: true },
  alertNumber: { type: String, required: true },
  type: { type: String, enum: stockAlertTypes, required: true },
  severity: { type: String, enum: ["WARNING", "CRITICAL"], required: true },
  status: { type: String, enum: alertStatuses, required: true, default: "OPEN" },
  title: { type: String, required: true },
  message: { type: String, required: true },
  availableQuantity: { type: Schema.Types.Decimal128, required: true },
  onHandQuantity: { type: Schema.Types.Decimal128, required: true },
  reservedQuantity: { type: Schema.Types.Decimal128, required: true },
  minimumQuantity: { type: Schema.Types.Decimal128, required: true },
  triggerSource: { type: String, required: true },
  triggeredAt: { type: Date, required: true },
  acknowledgedAt: { type: Date, default: null },
  acknowledgedBy: { type: Schema.Types.ObjectId, default: null, ref: "User" },
  acknowledgmentNote: { type: String, default: null },
  resolvedAt: { type: Date, default: null },
  resolutionReason: { type: String, default: null },
  history: { type: [eventSchema], default: [] },
}, { timestamps: true, collection: "alerts", optimisticConcurrency: true });

alertSchema.index({ organizationId: 1, alertNumber: 1 }, { unique: true });
alertSchema.index({ organizationId: 1, conditionKey: 1 }, { unique: true, partialFilterExpression: { resolvedAt: null } });
alertSchema.index({ organizationId: 1, siteId: 1, status: 1, _id: -1 });
alertSchema.index({ organizationId: 1, materialId: 1, status: 1 });

type AlertDocument = InferSchemaType<typeof alertSchema>;
export const Alert = (mongoose.models.Alert as Model<AlertDocument> | undefined) ?? mongoose.model<AlertDocument>("Alert", alertSchema);
