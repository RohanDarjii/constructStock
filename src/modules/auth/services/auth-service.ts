import "server-only";
import { randomBytes } from "node:crypto";
import mongoose from "mongoose";
import { ensureAuditReady, recordAudit } from "@/modules/audit/services/record-audit";
import { listActiveSiteIds } from "@/modules/users/services/site-access";
import { connectToDatabase } from "@/server/db/connect";
import type { SessionContext, OrganizationRole } from "@/server/auth/session-context";
import { AppError } from "@/shared/errors/app-error";
import { AuthSession, Membership, Organization, User } from "../models/identity";
import type { LoginInput, RegisterCompanyInput } from "../schemas/auth";
import { enforceRateLimit, hashPassword, hashToken, isDuplicateKey, randomToken, SESSION_DAYS, verifyPassword } from "./security";

const hour = 60 * 60 * 1000;
const day = 24 * hour;

const permissions: Record<OrganizationRole, readonly string[]> = {
  OWNER: ["organization.manage", "user.manage", "site.manage", "material.manage", "supplier.manage", "purchase_order.create", "purchase_order.approve", "purchase_order.order", "inventory.view", "inventory.receive", "inventory.consume", "inventory.adjust", "wastage.create", "transfer.request", "transfer.approve", "transfer.dispatch", "transfer.receive", "reports.view", "audit.view"],
  ADMIN: ["user.manage", "site.manage", "material.manage", "supplier.manage", "purchase_order.create", "purchase_order.approve", "purchase_order.order", "inventory.view", "inventory.receive", "inventory.consume", "wastage.create", "transfer.request", "transfer.approve", "transfer.dispatch", "transfer.receive", "reports.view", "audit.view"],
  SITE_MANAGER: ["purchase_order.create", "inventory.view", "inventory.receive", "inventory.consume", "wastage.create", "transfer.request", "transfer.dispatch", "transfer.receive", "reports.view"],
  STOREKEEPER: ["inventory.view", "inventory.receive", "inventory.consume", "wastage.create", "transfer.dispatch", "transfer.receive"],
};

export interface CurrentIdentity {
  context: SessionContext;
  user: { id: string; name: string; email: string };
  organization: { id: string; name: string; currencyCode: string };
  membership: { id: string; role: OrganizationRole; permissions: readonly string[] };
  siteAssignments: string[];
}

export async function registerCompany(input: RegisterCompanyInput, ipAddress: string | null) {
  await connectToDatabase();
  await enforceRateLimit("register-email", input.email, 3, hour);
  if (ipAddress) await enforceRateLimit("register-ip", ipAddress, 10, hour);
  await Promise.all([User.init(), Organization.init(), Membership.init(), ensureAuditReady()]);

  const userId = new mongoose.Types.ObjectId();
  const organizationId = new mongoose.Types.ObjectId();
  const passwordHash = await hashPassword(input.password);
  const slugBase = input.companyName.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "company";
  const slug = slugBase + "-" + randomBytes(8).toString("hex");

  try {
    await mongoose.connection.transaction(async (session) => {
      await User.create([{ _id: userId, name: input.ownerName, email: input.email, passwordHash }], { session });
      await Organization.create([{ _id: organizationId, name: input.companyName, slug, currencyCode: input.currencyCode, createdBy: userId }], { session });
      await Membership.create([{ organizationId, userId, role: "OWNER", status: "ACTIVE" }], { session });
      await recordAudit({ organizationId, actorUserId: userId, action: "organization.registered", entityType: "organization", entityId: organizationId.toString(), ipAddress }, session);
    });
  } catch (error) {
    if (isDuplicateKey(error)) {
      const keyPattern = (error as { keyPattern?: Record<string, number> }).keyPattern;
      if (keyPattern?.email) throw new AppError("EMAIL_ALREADY_REGISTERED", "This email is already registered.", 409);
      throw new AppError("CONFLICT", "A unique account value is already in use. Please retry.", 409);
    }
    throw error;
  }

  return {
    organization: { id: organizationId.toString(), name: input.companyName, status: "ACTIVE", currencyCode: input.currencyCode },
    user: { id: userId.toString(), name: input.ownerName, email: input.email },
    membership: { role: "OWNER", status: "ACTIVE" },
  };
}

export async function login(input: LoginInput, ipAddress: string | null, userAgent: string | null) {
  await connectToDatabase();
  await enforceRateLimit("login-email", input.email, 10, 15 * 60 * 1000);
  if (ipAddress) await enforceRateLimit("login-ip", ipAddress, 40, 15 * 60 * 1000);
  const user = await User.findOne({ email: input.email, deletedAt: null }).select("+passwordHash");
  if (!user) {
    await hashPassword(input.password); // Keep unknown-account attempts expensive too.
    throw new AppError("INVALID_CREDENTIALS", "Invalid email or password.", 401);
  }
  const passwordValid = await verifyPassword(user.passwordHash, input.password);
  if (!passwordValid) throw new AppError("INVALID_CREDENTIALS", "Invalid email or password.", 401);
  if (user.status !== "ACTIVE") throw new AppError("ACCOUNT_INACTIVE", "This account is not active.", 403);

  const memberships = await Membership.find({ userId: user._id, status: "ACTIVE" });
  if (memberships.length === 0) throw new AppError("ACCOUNT_INACTIVE", "This account has no active organization.", 403);
  if (memberships.length > 1) throw new AppError("ORGANIZATION_SELECTION_REQUIRED", "Choose an organization before signing in.", 409);
  const membership = memberships[0];
  const organization = await Organization.findOne({ _id: membership.organizationId, status: "ACTIVE", deletedAt: null });
  if (!organization) throw new AppError("ORGANIZATION_INACTIVE", "This organization is not active.", 403);

  const sessionToken = randomToken();
  const sessionId = new mongoose.Types.ObjectId();
  await AuthSession.init();
  await mongoose.connection.transaction(async (session) => {
    await AuthSession.create([{ _id: sessionId, userId: user._id, activeOrganizationId: organization._id, sessionTokenHash: hashToken(sessionToken), expiresAt: new Date(Date.now() + SESSION_DAYS * day), ipAddress, userAgent }], { session });
    await recordAudit({ organizationId: organization._id, actorUserId: user._id, action: "auth.login", entityType: "session", entityId: sessionId.toString(), ipAddress }, session);
  });
  const assignedSiteIds = await listActiveSiteIds(organization._id, user._id);
  const identity = publicIdentity(user, organization, membership, sessionId.toString(), assignedSiteIds);
  return { sessionToken, identity };
}

function publicIdentity(user: { _id: mongoose.Types.ObjectId; name: string; email: string }, organization: { _id: mongoose.Types.ObjectId; name: string; currencyCode: string }, membership: { _id: mongoose.Types.ObjectId; role: string }, sessionId: string, assignedSiteIds: string[]): CurrentIdentity {
  const role = membership.role as OrganizationRole;
  return {
    context: { sessionId, userId: user._id.toString(), organizationId: organization._id.toString(), membershipId: membership._id.toString(), role, assignedSiteIds },
    user: { id: user._id.toString(), name: user.name, email: user.email },
    organization: { id: organization._id.toString(), name: organization.name, currencyCode: organization.currencyCode },
    membership: { id: membership._id.toString(), role, permissions: permissions[role] },
    siteAssignments: assignedSiteIds,
  };
}

export async function identityFromSessionToken(token: string | undefined): Promise<CurrentIdentity | null> {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  await connectToDatabase();
  const session = await AuthSession.findOne({ sessionTokenHash: hashToken(token), revokedAt: null, expiresAt: { $gt: new Date() } });
  if (!session) return null;
  if (session.lastUsedAt.getTime() + day < Date.now()) {
    await AuthSession.updateOne({ _id: session._id }, { $set: { revokedAt: new Date() } });
    return null;
  }
  const [user, organization, membership] = await Promise.all([
    User.findOne({ _id: session.userId, status: "ACTIVE", deletedAt: null }),
    Organization.findOne({ _id: session.activeOrganizationId, status: "ACTIVE", deletedAt: null }),
    Membership.findOne({ userId: session.userId, organizationId: session.activeOrganizationId, status: "ACTIVE" }),
  ]);
  if (!user || !organization || !membership) return null;
  if (session.lastUsedAt.getTime() + 15 * 60 * 1000 < Date.now()) {
    await AuthSession.updateOne({ _id: session._id, revokedAt: null }, { $set: { lastUsedAt: new Date() } });
  }
  const assignedSiteIds = await listActiveSiteIds(organization._id, user._id);
  return publicIdentity(user, organization, membership, session._id.toString(), assignedSiteIds);
}

export async function logout(sessionToken: string): Promise<void> {
  await connectToDatabase();
  await AuthSession.updateOne({ sessionTokenHash: hashToken(sessionToken), revokedAt: null }, { $set: { revokedAt: new Date() } });
}
