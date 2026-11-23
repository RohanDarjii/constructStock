import "server-only";
import mongoose from "mongoose";
import { ensureAuditReady, recordAudit } from "@/modules/audit/services/record-audit";
import { AuthSession, Membership, Organization, User } from "@/modules/auth/models/identity";
import type { CurrentIdentity } from "@/modules/auth/services/auth-service";
import { enforceRateLimit, hashPassword, hashToken, isDuplicateKey, randomToken } from "@/modules/auth/services/security";
import { Site } from "@/modules/sites/models/site";
import { requirePermission } from "@/server/auth/authorize";
import { getAuthEnv } from "@/server/config/env";
import { connectToDatabase } from "@/server/db/connect";
import type { OrganizationRole } from "@/server/auth/session-context";
import { AppError } from "@/shared/errors/app-error";
import { SiteAssignment } from "../models/site-assignment";
import { UserInvitation } from "../models/user-invitation";
import type { InviteMemberInput, UpdateMembershipInput } from "../schemas/team";
import type { InvitationView, TeamMemberView } from "../types";

const invitationLifetimeMs = 7 * 24 * 60 * 60 * 1000;

function objectId(value: string): mongoose.Types.ObjectId {
  if (!/^[a-fA-F0-9]{24}$/.test(value)) throw new AppError("USER_NOT_FOUND", "Team member not found.", 404);
  return new mongoose.Types.ObjectId(value);
}

function organizationId(identity: CurrentIdentity) { return objectId(identity.context.organizationId); }
function actorId(identity: CurrentIdentity) { return objectId(identity.context.userId); }

function ensureRoleGrant(managerRole: string, targetRole: string, nextRole: string): void {
  if (managerRole !== "OWNER" && (["OWNER", "ADMIN"].includes(targetRole) || ["OWNER", "ADMIN"].includes(nextRole))) {
    throw new AppError("FORBIDDEN", "Only an Owner can manage Owners or Admins.", 403);
  }
}

async function currentManager(identity: CurrentIdentity, session: mongoose.ClientSession) {
  const manager = await Membership.findOne({ organizationId: organizationId(identity), userId: actorId(identity), status: "ACTIVE" }).session(session);
  if (!manager || !["OWNER", "ADMIN"].includes(manager.role)) throw new AppError("FORBIDDEN", "You cannot manage this team.", 403);
  return manager;
}

async function validateSiteIds(organization: mongoose.Types.ObjectId, ids: string[], session?: mongoose.ClientSession): Promise<mongoose.Types.ObjectId[]> {
  const siteObjectIds = ids.map(objectId);
  if (!ids.length) return siteObjectIds;
  const count = await Site.countDocuments({ organizationId: organization, _id: { $in: siteObjectIds }, deletedAt: null }).session(session ?? null);
  if (count !== ids.length) throw new AppError("INVALID_SITE_ASSIGNMENT", "Every assigned site must belong to this company and be current.", 422);
  return siteObjectIds;
}

async function replaceAssignments(organization: mongoose.Types.ObjectId, userId: mongoose.Types.ObjectId, ids: mongoose.Types.ObjectId[], assignedBy: mongoose.Types.ObjectId, session: mongoose.ClientSession) {
  const now = new Date();
  await SiteAssignment.updateMany({ organizationId: organization, userId, siteId: { $nin: ids }, revokedAt: null }, { $set: { revokedAt: now } }, { session });
  for (const siteId of ids) {
    await SiteAssignment.updateOne(
      { organizationId: organization, userId, siteId },
      { $set: { revokedAt: null, assignedAt: now, assignedBy }, $setOnInsert: { organizationId: organization, userId, siteId } },
      { upsert: true, session },
    );
  }
}

function invitationView(invite: InstanceType<typeof UserInvitation>): InvitationView {
  const status = invite.acceptedAt ? "ACCEPTED" : invite.revokedAt ? "REVOKED" : invite.expiresAt <= new Date() ? "EXPIRED" : "PENDING";
  return { id: invite._id.toString(), name: invite.name, email: invite.email, role: invite.role as OrganizationRole, siteIds: invite.siteIds.map(String), status, expiresAt: invite.expiresAt.toISOString(), createdAt: invite.createdAt.toISOString() };
}

function memberViewData(membership: InstanceType<typeof Membership>, user: { _id: mongoose.Types.ObjectId; name: string; email: string } | null | undefined, siteIds: string[]): TeamMemberView {
  const base = { id: membership.userId.toString(), role: membership.role as OrganizationRole, status: membership.status as TeamMemberView["status"], joinedAt: membership.joinedAt?.toISOString() ?? null };
  if (!user) return { ...base, name: "Unavailable account", email: null, missingUser: true, siteIds: [] };
  return { ...base, name: user.name, email: user.email, missingUser: false, siteIds };
}

async function memberView(membership: InstanceType<typeof Membership>, session?: mongoose.ClientSession): Promise<TeamMemberView> {
  const user = await User.findOne({ _id: membership.userId, deletedAt: null }).session(session ?? null);
  if (!user) return memberViewData(membership, null, []);
  const assignments = await SiteAssignment.find({ organizationId: membership.organizationId, userId: membership.userId, revokedAt: null }).select("siteId").session(session ?? null);
  return memberViewData(membership, user, assignments.map((assignment) => assignment.siteId.toString()));
}

export async function listTeamMembers(identity: CurrentIdentity, query: { limit: number; cursor?: string }) {
  requirePermission(identity, "user.manage");
  await connectToDatabase();
  const orgId = organizationId(identity);
  const memberships = await Membership.find({ organizationId: orgId, ...(query.cursor ? { _id: { $lt: objectId(query.cursor) } } : {}) }).sort({ _id: -1 }).limit(query.limit + 1);
  const hasMore = memberships.length > query.limit;
  const page = memberships.slice(0, query.limit);
  if (!page.length) return { members: [] as TeamMemberView[], pagination: { nextCursor: null, hasMore: false, limit: query.limit } };
  const userIds = page.map((membership) => membership.userId);
  const [users, assignments] = await Promise.all([
    User.find({ _id: { $in: userIds }, deletedAt: null }).select("name email"),
    SiteAssignment.find({ organizationId: orgId, userId: { $in: userIds }, revokedAt: null }).select("userId siteId"),
  ]);
  const usersById = new Map(users.map((user) => [user._id.toString(), user]));
  const sitesByUser = new Map<string, string[]>();
  for (const assignment of assignments) {
    const key = assignment.userId.toString();
    const existing = sitesByUser.get(key) ?? [];
    existing.push(assignment.siteId.toString());
    sitesByUser.set(key, existing);
  }
  return { members: page.map((membership) => memberViewData(membership, usersById.get(membership.userId.toString()), sitesByUser.get(membership.userId.toString()) ?? [])), pagination: { nextCursor: hasMore ? page.at(-1)?._id.toString() ?? null : null, hasMore, limit: query.limit } };
}

export async function listAssignableSites(identity: CurrentIdentity) {
  requirePermission(identity, "user.manage");
  await connectToDatabase();
  const sites = await Site.find({ organizationId: organizationId(identity), deletedAt: null }).select("name code").sort({ name: 1 });
  return sites.map((site) => ({ id: site._id.toString(), name: site.name, code: site.code }));
}

export async function getTeamMember(identity: CurrentIdentity, userId: string) {
  requirePermission(identity, "user.manage");
  await connectToDatabase();
  const membership = await Membership.findOne({ organizationId: organizationId(identity), userId: objectId(userId) });
  if (!membership) throw new AppError("USER_NOT_FOUND", "Team member not found.", 404);
  return memberView(membership);
}

export async function listInvitations(identity: CurrentIdentity, query: { limit: number; cursor?: string }) {
  requirePermission(identity, "user.manage");
  await connectToDatabase();
  const invites = await UserInvitation.find({ organizationId: organizationId(identity), ...(query.cursor ? { _id: { $lt: objectId(query.cursor) } } : {}) }).sort({ _id: -1 }).limit(query.limit + 1);
  const hasMore = invites.length > query.limit;
  const page = invites.slice(0, query.limit);
  return { invitations: page.map(invitationView), pagination: { nextCursor: hasMore ? page.at(-1)?._id.toString() ?? null : null, hasMore, limit: query.limit } };
}

export async function inviteMember(identity: CurrentIdentity, input: InviteMemberInput) {
  requirePermission(identity, "user.manage");
  const appUrl = getAuthEnv().APP_URL.replace(/\/$/, "");
  await connectToDatabase();
  await Promise.all([UserInvitation.init(), ensureAuditReady()]);
  const orgId = organizationId(identity);
  const token = randomToken();
  const expiresAt = new Date(Date.now() + invitationLifetimeMs);
  try {
    const invitation = await mongoose.connection.transaction(async (session) => {
      const manager = await currentManager(identity, session);
      ensureRoleGrant(manager.role, "STOREKEEPER", input.role);
      const ids = await validateSiteIds(orgId, input.siteIds, session);
      if (await User.exists({ email: input.email }).session(session)) throw new AppError("EMAIL_ALREADY_REGISTERED", "This email already has an account. Multi-company access is not available yet.", 409);
      await UserInvitation.updateMany({ organizationId: orgId, email: input.email, acceptedAt: null, revokedAt: null, expiresAt: { $lte: new Date() } }, { $set: { revokedAt: new Date() } }, { session });
      const pending = await UserInvitation.exists({ organizationId: orgId, email: input.email, acceptedAt: null, revokedAt: null }).session(session);
      if (pending) throw new AppError("INVITATION_EXISTS", "An invitation is already pending for this email.", 409);
      const [created] = await UserInvitation.create([{ organizationId: orgId, name: input.name, email: input.email, role: input.role, siteIds: ids, tokenHash: hashToken(token), expiresAt, invitedBy: actorId(identity) }], { session });
      await recordAudit({ organizationId: orgId, actorUserId: actorId(identity), action: "user.invited", entityType: "invitation", entityId: created._id.toString() }, session);
      return created;
    });
    const url = `${appUrl}/accept-invitation#token=${token}`;
    return { invitation: invitationView(invitation), invitationUrl: url };
  } catch (error) {
    if (isDuplicateKey(error)) throw new AppError("INVITATION_EXISTS", "An invitation is already pending for this email.", 409);
    throw error;
  }
}

export async function resendInvitation(identity: CurrentIdentity, invitationId: string) {
  requirePermission(identity, "user.manage");
  const appUrl = getAuthEnv().APP_URL.replace(/\/$/, "");
  await connectToDatabase();
  await ensureAuditReady();
  const orgId = organizationId(identity);
  const token = randomToken();
  const invitation = await mongoose.connection.transaction(async (session) => {
    const manager = await currentManager(identity, session);
    const existing = await UserInvitation.findOne({ _id: objectId(invitationId), organizationId: orgId, acceptedAt: null, revokedAt: null }).session(session);
    if (!existing) throw new AppError("INVITATION_NOT_FOUND", "Invitation not found or no longer pending.", 404);
    ensureRoleGrant(manager.role, existing.role, existing.role);
    existing.tokenHash = hashToken(token);
    existing.expiresAt = new Date(Date.now() + invitationLifetimeMs);
    await existing.save({ session });
    await recordAudit({ organizationId: orgId, actorUserId: actorId(identity), action: "user.invitation_reissued", entityType: "invitation", entityId: invitationId }, session);
    return existing;
  });
  return { invitation: invitationView(invitation), invitationUrl: `${appUrl}/accept-invitation#token=${token}` };
}

export async function revokeInvitation(identity: CurrentIdentity, invitationId: string) {
  requirePermission(identity, "user.manage");
  await connectToDatabase();
  await ensureAuditReady();
  const orgId = organizationId(identity);
  return mongoose.connection.transaction(async (session) => {
    const manager = await currentManager(identity, session);
    const invitation = await UserInvitation.findOne({ _id: objectId(invitationId), organizationId: orgId, acceptedAt: null, revokedAt: null }).session(session);
    if (!invitation) throw new AppError("INVITATION_NOT_FOUND", "Invitation not found or no longer pending.", 404);
    ensureRoleGrant(manager.role, invitation.role, invitation.role);
    invitation.revokedAt = new Date();
    await invitation.save({ session });
    await recordAudit({ organizationId: orgId, actorUserId: actorId(identity), action: "user.invitation_revoked", entityType: "invitation", entityId: invitationId }, session);
    return invitationView(invitation);
  });
}

export async function acceptInvitation(input: { token: string; password: string }, ipAddress: string | null) {
  await connectToDatabase();
  await enforceRateLimit("invitation-accept", hashToken(input.token), 10, 15 * 60 * 1000);
  if (ipAddress) await enforceRateLimit("invitation-accept-ip", ipAddress, 30, 15 * 60 * 1000);
  await Promise.all([User.init(), Membership.init(), SiteAssignment.init(), ensureAuditReady()]);
  const passwordHash = await hashPassword(input.password);
  try {
    return await mongoose.connection.transaction(async (session) => {
      const invitation = await UserInvitation.findOneAndUpdate(
        { tokenHash: hashToken(input.token), acceptedAt: null, revokedAt: null, expiresAt: { $gt: new Date() } },
        { $set: { acceptedAt: new Date() } }, { session, returnDocument: "after", projection: { tokenHash: 0 } },
      );
      if (!invitation) throw new AppError("INVALID_INVITATION", "This invitation has expired or was already used.", 410);
      const organization = await Organization.findOne({ _id: invitation.organizationId, status: "ACTIVE", deletedAt: null }).session(session);
      if (!organization) throw new AppError("ORGANIZATION_INACTIVE", "This company is not currently accepting invitations.", 403);
      if (await User.exists({ email: invitation.email }).session(session)) throw new AppError("EMAIL_ALREADY_REGISTERED", "This email already has an account.", 409);
      const validSites = await validateSiteIds(invitation.organizationId, invitation.siteIds.map(String), session);
      const [user] = await User.create([{ name: invitation.name, email: invitation.email, passwordHash }], { session });
      await Membership.create([{ organizationId: invitation.organizationId, userId: user._id, role: invitation.role, status: "ACTIVE", joinedAt: new Date() }], { session });
      await replaceAssignments(invitation.organizationId, user._id, validSites, invitation.invitedBy, session);
      await recordAudit({ organizationId: invitation.organizationId, actorUserId: user._id, action: "user.invitation_accepted", entityType: "user", entityId: user._id.toString() }, session);
      return { user: { id: user._id.toString(), name: user.name, email: user.email } };
    });
  } catch (error) {
    if (isDuplicateKey(error)) throw new AppError("EMAIL_ALREADY_REGISTERED", "This email already has an account.", 409);
    throw error;
  }
}

export async function updateMembership(identity: CurrentIdentity, userId: string, input: UpdateMembershipInput) {
  requirePermission(identity, "user.manage");
  await connectToDatabase();
  await ensureAuditReady();
  const orgId = organizationId(identity);
  return mongoose.connection.transaction(async (session) => {
    await Organization.updateOne({ _id: orgId }, { $inc: { accessVersion: 1 } }, { session });
    const manager = await currentManager(identity, session);
    const membership = await Membership.findOne({ organizationId: orgId, userId: objectId(userId) }).session(session);
    if (!membership) throw new AppError("USER_NOT_FOUND", "Team member not found.", 404);
    const previousRole = membership.role;
    const nextRole = input.role ?? membership.role;
    const nextStatus = input.status ?? membership.status;
    ensureRoleGrant(manager.role, membership.role, nextRole);
    if (!await User.exists({ _id: membership.userId, deletedAt: null }).session(session) && (nextStatus !== "INACTIVE" || input.role !== undefined)) {
      throw new AppError("USER_RECORD_MISSING", "This membership has no user account. It can only be deactivated.", 409);
    }
    if (membership.userId.equals(actorId(identity)) && (nextStatus !== "ACTIVE" || nextRole !== membership.role)) throw new AppError("SELF_ACCESS_CHANGE", "You cannot remove your own team access.", 409);
    if (membership.role === "OWNER" && membership.status === "ACTIVE" && (nextRole !== "OWNER" || nextStatus !== "ACTIVE")) {
      const owners = await Membership.countDocuments({ organizationId: orgId, role: "OWNER", status: "ACTIVE" }).session(session);
      if (owners <= 1) throw new AppError("LAST_OWNER", "The company must retain an active Owner.", 409);
    }
    membership.role = nextRole;
    membership.status = nextStatus;
    await membership.save({ session });
    if (nextStatus !== "ACTIVE" || nextRole !== previousRole) {
      await AuthSession.updateMany({ userId: membership.userId, activeOrganizationId: orgId, revokedAt: null }, { $set: { revokedAt: new Date() } }, { session });
    }
    await recordAudit({ organizationId: orgId, actorUserId: actorId(identity), action: "user.membership_changed", entityType: "user", entityId: userId }, session);
    return memberView(membership, session);
  });
}

export async function replaceMemberSites(identity: CurrentIdentity, userId: string, siteIds: string[]) {
  requirePermission(identity, "user.manage");
  await connectToDatabase();
  await Promise.all([SiteAssignment.init(), ensureAuditReady()]);
  const orgId = organizationId(identity);
  return mongoose.connection.transaction(async (session) => {
    const manager = await currentManager(identity, session);
    const membership = await Membership.findOne({ organizationId: orgId, userId: objectId(userId), status: "ACTIVE" }).session(session);
    if (!membership) throw new AppError("USER_NOT_FOUND", "Active team member not found.", 404);
    ensureRoleGrant(manager.role, membership.role, membership.role);
    if (!await User.exists({ _id: membership.userId, deletedAt: null }).session(session)) throw new AppError("USER_RECORD_MISSING", "This membership has no active user account.", 409);
    const ids = await validateSiteIds(orgId, siteIds, session);
    await replaceAssignments(orgId, membership.userId, ids, actorId(identity), session);
    await recordAudit({ organizationId: orgId, actorUserId: actorId(identity), action: "user.sites_changed", entityType: "user", entityId: userId }, session);
    return memberView(membership, session);
  });
}
