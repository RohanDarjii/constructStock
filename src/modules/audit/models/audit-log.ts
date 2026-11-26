import "server-only";
import mongoose, { type InferSchemaType, type Model, Schema } from "mongoose";

const auditSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
  actorUserId: { type: Schema.Types.ObjectId, required: true, ref: "User" },
  action: { type: String, required: true },
  entityType: { type: String, required: true },
  entityId: { type: String, required: true },
  metadata: { type: Schema.Types.Mixed, default: null },
  ipAddress: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
}, { collection: "audit_logs" });
auditSchema.index({ organizationId: 1, createdAt: -1 });
auditSchema.index({ organizationId: 1, actorUserId: 1, createdAt: -1 });
auditSchema.index({ organizationId: 1, entityType: 1, entityId: 1, createdAt: -1 });

type AuditDoc = InferSchemaType<typeof auditSchema>;
export const AuditLog = (mongoose.models.AuditLog as Model<AuditDoc> | undefined) ?? mongoose.model<AuditDoc>("AuditLog", auditSchema);
