import "server-only";
import mongoose, { type InferSchemaType, type Model, Schema } from "mongoose";

const invitationSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  role: { type: String, enum: ["OWNER", "ADMIN", "SITE_MANAGER", "STOREKEEPER"], required: true },
  siteIds: [{ type: Schema.Types.ObjectId, ref: "Site" }],
  tokenHash: { type: String, required: true, select: false },
  expiresAt: { type: Date, required: true },
  acceptedAt: { type: Date, default: null },
  revokedAt: { type: Date, default: null },
  invitedBy: { type: Schema.Types.ObjectId, required: true, ref: "User" },
}, { collection: "user_invitations", timestamps: true });

invitationSchema.index({ tokenHash: 1 }, { unique: true });
invitationSchema.index({ organizationId: 1, email: 1 }, { unique: true, partialFilterExpression: { acceptedAt: null, revokedAt: null } });
invitationSchema.index({ organizationId: 1, _id: -1 });

type InvitationDoc = InferSchemaType<typeof invitationSchema>;
export const UserInvitation = (mongoose.models.UserInvitation as Model<InvitationDoc> | undefined) ?? mongoose.model<InvitationDoc>("UserInvitation", invitationSchema);
