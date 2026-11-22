import "server-only";
import mongoose, { type InferSchemaType, type Model, Schema } from "mongoose";

const siteAssignmentSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
  siteId: { type: Schema.Types.ObjectId, required: true, ref: "Site" },
  userId: { type: Schema.Types.ObjectId, required: true, ref: "User" },
  assignedBy: { type: Schema.Types.ObjectId, required: true, ref: "User" },
  assignedAt: { type: Date, default: Date.now },
  revokedAt: { type: Date, default: null },
}, { collection: "site_assignments" });

siteAssignmentSchema.index({ organizationId: 1, siteId: 1, userId: 1 }, { unique: true });
siteAssignmentSchema.index({ organizationId: 1, userId: 1, revokedAt: 1 });

type SiteAssignmentDoc = InferSchemaType<typeof siteAssignmentSchema>;
export const SiteAssignment = (mongoose.models.SiteAssignment as Model<SiteAssignmentDoc> | undefined) ?? mongoose.model<SiteAssignmentDoc>("SiteAssignment", siteAssignmentSchema);
