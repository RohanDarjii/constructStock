import "server-only";
import mongoose, { type InferSchemaType, type Model, Schema } from "mongoose";

const userSchema = new Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  status: { type: String, enum: ["ACTIVE", "INACTIVE", "LOCKED"], default: "ACTIVE" },
  deletedAt: { type: Date, default: null },
  deletedBy: { type: Schema.Types.ObjectId, default: null, ref: "User" },
}, { timestamps: true, collection: "users" });
userSchema.index({ email: 1 }, { unique: true });

const organizationSchema = new Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true },
  currencyCode: { type: String, required: true },
  status: { type: String, enum: ["ACTIVE", "SUSPENDED", "DISABLED"], default: "ACTIVE" },
  createdBy: { type: Schema.Types.ObjectId, required: true, ref: "User" },
  deletedAt: { type: Date, default: null },
  deletedBy: { type: Schema.Types.ObjectId, default: null, ref: "User" },
}, { timestamps: true, collection: "organizations" });
organizationSchema.index({ slug: 1 }, { unique: true });

const membershipSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
  userId: { type: Schema.Types.ObjectId, required: true, ref: "User" },
  role: { type: String, enum: ["OWNER", "ADMIN", "SITE_MANAGER", "STOREKEEPER"], required: true },
  status: { type: String, enum: ["ACTIVE", "INACTIVE", "INVITED"], default: "ACTIVE" },
  joinedAt: { type: Date, default: Date.now },
}, { timestamps: true, collection: "organization_memberships" });
membershipSchema.index({ organizationId: 1, userId: 1 }, { unique: true });
membershipSchema.index({ userId: 1, status: 1 });

const sessionSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, required: true, ref: "User" },
  activeOrganizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
  sessionTokenHash: { type: String, required: true, select: false },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
  lastUsedAt: { type: Date, default: Date.now },
  revokedAt: { type: Date, default: null },
  ipAddress: { type: String, default: null },
  userAgent: { type: String, default: null },
}, { collection: "sessions" });
sessionSchema.index({ sessionTokenHash: 1 }, { unique: true });
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
sessionSchema.index({ userId: 1, revokedAt: 1 });

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

const rateLimitSchema = new Schema({
  key: { type: String, required: true },
  count: { type: Number, required: true },
  expiresAt: { type: Date, required: true },
}, { collection: "auth_rate_limits" });
rateLimitSchema.index({ key: 1 }, { unique: true });
rateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

type UserDoc = InferSchemaType<typeof userSchema>;
type OrganizationDoc = InferSchemaType<typeof organizationSchema>;
type MembershipDoc = InferSchemaType<typeof membershipSchema>;
type SessionDoc = InferSchemaType<typeof sessionSchema>;
type AuditDoc = InferSchemaType<typeof auditSchema>;
type RateLimitDoc = InferSchemaType<typeof rateLimitSchema>;

export const User = (mongoose.models.User as Model<UserDoc> | undefined) ?? mongoose.model<UserDoc>("User", userSchema);
export const Organization = (mongoose.models.Organization as Model<OrganizationDoc> | undefined) ?? mongoose.model<OrganizationDoc>("Organization", organizationSchema);
export const Membership = (mongoose.models.Membership as Model<MembershipDoc> | undefined) ?? mongoose.model<MembershipDoc>("Membership", membershipSchema);
export const AuthSession = (mongoose.models.AuthSession as Model<SessionDoc> | undefined) ?? mongoose.model<SessionDoc>("AuthSession", sessionSchema);
export const AuditLog = (mongoose.models.AuditLog as Model<AuditDoc> | undefined) ?? mongoose.model<AuditDoc>("AuditLog", auditSchema);
export const AuthRateLimit = (mongoose.models.AuthRateLimit as Model<RateLimitDoc> | undefined) ?? mongoose.model<RateLimitDoc>("AuthRateLimit", rateLimitSchema);
