import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { AuditLog } from "@/modules/audit/models/audit-log";
import { Membership } from "@/modules/auth/models/identity";
import { identityFromSessionToken, login, registerCompany } from "@/modules/auth/services/auth-service";
import { createSiteSchema } from "@/modules/sites/schemas/site";
import { createSite } from "@/modules/sites/services/site-service";
import { UserInvitation } from "@/modules/users/models/user-invitation";
import { acceptInvitation, getTeamMember, inviteMember, listInvitations, listTeamMembers, replaceMemberSites, resendInvitation, revokeInvitation, updateMembership } from "@/modules/users/services/team-service";

let replicaSet: MongoMemoryReplSet;

async function owner(name: string, email: string) {
  const password = "strong-password-123";
  const registered = await registerCompany({ companyName: name, ownerName: name, email, password, currencyCode: "EUR" }, null);
  const signedIn = await login({ email, password }, null, null);
  return { registered, signedIn, identity: signedIn.identity };
}

function tokenFrom(url: string) { return new URLSearchParams(new URL(url).hash.slice(1)).get("token")!; }

beforeAll(async () => {
  replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = replicaSet.getUri();
  process.env.MONGODB_DB_NAME = "constructstock_team_test";
  process.env.APP_URL = "http://localhost:3000";
  process.env.TOKEN_PEPPER = "test-only-pepper-with-more-than-thirty-two-characters";
});

afterAll(async () => {
  await mongoose.disconnect();
  globalThis.constructStockMongoose = undefined;
  await replicaSet?.stop();
});

describe("team and access management", () => {
  it("accepts single-use invitations and enforces tenant and site boundaries", async () => {
    const first = await owner("First Builder", "team-owner-first@example.com");
    const second = await owner("Second Builder", "team-owner-second@example.com");
    const site = await createSite(first.identity, createSiteSchema.parse({ code: "FIRST", name: "First Yard", location: { city: "Berlin", country: "Germany" }, status: "ACTIVE" }));
    const otherSite = await createSite(second.identity, createSiteSchema.parse({ code: "SECOND", name: "Second Yard", location: { city: "Berlin", country: "Germany" }, status: "ACTIVE" }));
    await expect(inviteMember(first.identity, { name: "Staff", email: "staff-invalid@example.com", role: "STOREKEEPER", siteIds: [otherSite.id] })).rejects.toMatchObject({ code: "INVALID_SITE_ASSIGNMENT" });
    const created = await inviteMember(first.identity, { name: "Staff Member", email: "team-staff@example.com", role: "STOREKEEPER", siteIds: [site.id] });
    expect(created.invitationUrl).toContain("#token=");
    const token = tokenFrom(created.invitationUrl);
    const invitation = await UserInvitation.findById(created.invitation.id).select("+tokenHash");
    expect(invitation?.tokenHash).not.toBe(token);
    await expect(inviteMember(first.identity, { name: "Staff Member", email: "team-staff@example.com", role: "STOREKEEPER", siteIds: [] })).rejects.toMatchObject({ code: "INVITATION_EXISTS" });
    expect((await listInvitations(second.identity, { limit: 25 })).invitations).toEqual([]);
    await expect(revokeInvitation(second.identity, created.invitation.id)).rejects.toMatchObject({ code: "INVITATION_NOT_FOUND" });

    const accepted = await acceptInvitation({ token, password: "staff-password-123" }, null);
    await expect(acceptInvitation({ token, password: "staff-password-123" }, null)).rejects.toMatchObject({ code: "INVALID_INVITATION" });
    const staffLogin = await login({ email: "team-staff@example.com", password: "staff-password-123" }, null, null);
    expect(staffLogin.identity.siteAssignments).toEqual([site.id]);
    expect((await getTeamMember(first.identity, accepted.user.id)).role).toBe("STOREKEEPER");
    await expect(getTeamMember(second.identity, accepted.user.id)).rejects.toMatchObject({ code: "USER_NOT_FOUND" });
    await expect(listTeamMembers(staffLogin.identity, { limit: 25 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(replaceMemberSites(first.identity, accepted.user.id, [otherSite.id])).rejects.toMatchObject({ code: "INVALID_SITE_ASSIGNMENT" });
    expect((await listTeamMembers(first.identity, { limit: 25 })).members).toHaveLength(2);

    await replaceMemberSites(first.identity, accepted.user.id, []);
    expect((await identityFromSessionToken(staffLogin.sessionToken))?.siteAssignments).toEqual([]);
    await updateMembership(first.identity, accepted.user.id, { role: "SITE_MANAGER" });
    expect(await identityFromSessionToken(staffLogin.sessionToken)).toBeNull();
    const relogin = await login({ email: "team-staff@example.com", password: "staff-password-123" }, null, null);
    expect(relogin.identity.membership.role).toBe("SITE_MANAGER");
    await updateMembership(first.identity, accepted.user.id, { status: "INACTIVE" });
    expect(await identityFromSessionToken(relogin.sessionToken)).toBeNull();
    await expect(login({ email: "team-staff@example.com", password: "staff-password-123" }, null, null)).rejects.toMatchObject({ code: "ACCOUNT_INACTIVE" });
    await updateMembership(first.identity, accepted.user.id, { status: "ACTIVE" });
    expect((await login({ email: "team-staff@example.com", password: "staff-password-123" }, null, null)).identity.membership.role).toBe("SITE_MANAGER");
    expect((await AuditLog.find({ organizationId: new mongoose.Types.ObjectId(first.registered.organization.id), entityType: "user", entityId: accepted.user.id })).map((entry) => entry.action)).toContain("user.membership_changed");
  });

  it("reissues expiring links, enforces Owner authority, and protects the last Owner", async () => {
    const company = await owner("Role Company", "role-owner@example.com");
    const adminInvite = await inviteMember(company.identity, { name: "Admin", email: "team-admin@example.com", role: "ADMIN", siteIds: [] });
    const oldToken = tokenFrom(adminInvite.invitationUrl);
    await UserInvitation.updateOne({ _id: new mongoose.Types.ObjectId(adminInvite.invitation.id) }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(acceptInvitation({ token: oldToken, password: "admin-password-123" }, null)).rejects.toMatchObject({ code: "INVALID_INVITATION" });
    const reissued = await resendInvitation(company.identity, adminInvite.invitation.id);
    expect(tokenFrom(reissued.invitationUrl)).not.toBe(oldToken);
    await expect(acceptInvitation({ token: oldToken, password: "admin-password-123" }, null)).rejects.toMatchObject({ code: "INVALID_INVITATION" });
    const admin = await acceptInvitation({ token: tokenFrom(reissued.invitationUrl), password: "admin-password-123" }, null);
    const adminLogin = await login({ email: admin.user.email, password: "admin-password-123" }, null, null);
    await expect(inviteMember(adminLogin.identity, { name: "Owner", email: "illegal-owner@example.com", role: "OWNER", siteIds: [] })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(updateMembership(adminLogin.identity, company.registered.user.id, { role: "STOREKEEPER" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(updateMembership(company.identity, company.registered.user.id, { status: "INACTIVE" })).rejects.toMatchObject({ code: "SELF_ACCESS_CHANGE" });
    const pending = await inviteMember(company.identity, { name: "Pending", email: "pending-member@example.com", role: "STOREKEEPER", siteIds: [] });
    await revokeInvitation(company.identity, pending.invitation.id);
    await expect(acceptInvitation({ token: tokenFrom(pending.invitationUrl), password: "pending-password-123" }, null)).rejects.toMatchObject({ code: "INVALID_INVITATION" });
  });

  it("shows memberships with missing user records without crashing the team page", async () => {
    const company = await owner("Recovery Company", "recovery-owner@example.com");
    const missingUserId = new mongoose.Types.ObjectId();
    await Membership.create({ organizationId: new mongoose.Types.ObjectId(company.registered.organization.id), userId: missingUserId, role: "STOREKEEPER", status: "ACTIVE" });
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const listed = await listTeamMembers(company.identity, { limit: 25 });
      expect(listed.members).toHaveLength(2);
      expect(listed.members.find((member) => member.id === missingUserId.toString())).toMatchObject({ name: "Unavailable account", email: null, missingUser: true, status: "ACTIVE" });
      expect(listed.members.find((member) => member.id === company.registered.user.id)?.missingUser).toBe(false);
      expect(errorLog).not.toHaveBeenCalled();
      const firstPage = await listTeamMembers(company.identity, { limit: 1 });
      const secondPage = await listTeamMembers(company.identity, { limit: 1, cursor: firstPage.pagination.nextCursor! });
      expect(firstPage.pagination.hasMore).toBe(true);
      expect([firstPage.members[0].id, secondPage.members[0].id].sort()).toEqual([missingUserId.toString(), company.registered.user.id].sort());
      await expect(replaceMemberSites(company.identity, missingUserId.toString(), [])).rejects.toMatchObject({ code: "USER_RECORD_MISSING" });
      await expect(updateMembership(company.identity, missingUserId.toString(), { role: "SITE_MANAGER" })).rejects.toMatchObject({ code: "USER_RECORD_MISSING" });
      await expect(updateMembership(company.identity, missingUserId.toString(), { status: "ACTIVE" })).rejects.toMatchObject({ code: "USER_RECORD_MISSING" });
      expect(await updateMembership(company.identity, missingUserId.toString(), { status: "INACTIVE" })).toMatchObject({ missingUser: true, status: "INACTIVE" });
    } finally {
      errorLog.mockRestore();
    }
  });
});
