import { afterAll, beforeAll, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { AuditLog } from "@/modules/audit/models/audit-log";
import { Membership, User } from "@/modules/auth/models/identity";
import { identityFromSessionToken, login, registerCompany } from "@/modules/auth/services/auth-service";
import { hashPassword } from "@/modules/auth/services/security";
import { Site } from "@/modules/sites/models/site";
import { createSiteSchema, updateSiteSchema } from "@/modules/sites/schemas/site";
import { archiveSite, createSite, getSite, listSites, restoreSite, updateSite } from "@/modules/sites/services/site-service";
import { SiteAssignment } from "@/modules/users/models/site-assignment";

let replicaSet: MongoMemoryReplSet;
const baseSite = { code: "SITE-001", name: "North Yard", location: { city: "Berlin", country: "Germany" }, status: "ACTIVE" as const };

async function owner(companyName: string, email: string) {
  const password = "strong-password-123";
  const registered = await registerCompany({ companyName, ownerName: "Owner", email, password, currencyCode: "EUR" }, null);
  const signedIn = await login({ email, password }, null, null);
  return { registered, signedIn, identity: signedIn.identity };
}

beforeAll(async () => {
  replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = replicaSet.getUri();
  process.env.MONGODB_DB_NAME = "constructstock_sites_test";
  process.env.APP_URL = "http://localhost:3000";
  process.env.TOKEN_PEPPER = "test-only-pepper-with-more-than-thirty-two-characters";
});

afterAll(async () => {
  await mongoose.disconnect();
  globalThis.constructStockMongoose = undefined;
  await replicaSet?.stop();
});

describe("tenant-scoped site management", () => {
  it("scopes site codes, listing, and IDs to the active organization", async () => {
    const first = await owner("First Company", "site-first@example.com");
    const second = await owner("Second Company", "site-second@example.com");
    const input = createSiteSchema.parse(baseSite);
    const firstSite = await createSite(first.identity, input);
    const secondSite = await createSite(second.identity, input);
    expect(firstSite.id).not.toBe(secondSite.id);
    await expect(createSite(first.identity, input)).rejects.toMatchObject({ code: "SITE_CODE_EXISTS" });
    await expect(getSite(first.identity, secondSite.id)).rejects.toMatchObject({ code: "SITE_NOT_FOUND" });
    await expect(updateSite(first.identity, secondSite.id, updateSiteSchema.parse({ name: "Other" }))).rejects.toMatchObject({ code: "SITE_NOT_FOUND" });
    const ownSites = await listSites(first.identity, { limit: 25 });
    expect(ownSites.sites.map((site) => site.id)).toContain(firstSite.id);
    expect(ownSites.sites.map((site) => site.id)).not.toContain(secondSite.id);
    const another = await createSite(first.identity, createSiteSchema.parse({ ...baseSite, code: "SITE-002", name: "South Yard" }));
    expect((await listSites(first.identity, { limit: 25, q: "North" })).sites.map((site) => site.id)).toEqual([firstSite.id]);
    expect((await listSites(first.identity, { limit: 25, q: "N.rth" })).sites).toEqual([]);
    expect((await listSites(first.identity, { limit: 25, q: "Berlin" })).sites).toHaveLength(2);
    const firstPage = await listSites(first.identity, { limit: 1 });
    expect(firstPage.pagination.hasMore).toBe(true);
    const secondPage = await listSites(first.identity, { limit: 1, cursor: firstPage.pagination.nextCursor! });
    expect([firstPage.sites[0].id, secondPage.sites[0].id].sort()).toEqual([firstSite.id, another.id].sort());
  });

  it("limits staff to assigned sites and reacts to assignment revocation", async () => {
    const company = await owner("Assignment Company", "site-owner@example.com");
    const assignedSite = await createSite(company.identity, createSiteSchema.parse(baseSite));
    const otherSite = await createSite(company.identity, createSiteSchema.parse({ ...baseSite, code: "SITE-002" }));
    const organizationId = new mongoose.Types.ObjectId(company.registered.organization.id);
    const ownerId = new mongoose.Types.ObjectId(company.registered.user.id);
    const staff = await User.create({ name: "Storekeeper", email: "site-staff@example.com", passwordHash: await hashPassword("strong-password-456") });
    await Membership.create({ organizationId, userId: staff._id, role: "STOREKEEPER", status: "ACTIVE" });
    await SiteAssignment.create({ organizationId, siteId: new mongoose.Types.ObjectId(assignedSite.id), userId: staff._id, assignedBy: ownerId });
    const signedIn = await login({ email: staff.email, password: "strong-password-456" }, null, null);
    expect(signedIn.identity.siteAssignments).toEqual([assignedSite.id]);
    expect((await listSites(signedIn.identity, { limit: 25 })).sites.map((site) => site.id)).toEqual([assignedSite.id]);
    expect((await listSites(signedIn.identity, { limit: 25, q: "Berlin" })).sites.map((site) => site.id)).toEqual([assignedSite.id]);
    expect((await getSite(signedIn.identity, assignedSite.id)).id).toBe(assignedSite.id);
    await expect(getSite(signedIn.identity, otherSite.id)).rejects.toMatchObject({ code: "SITE_NOT_FOUND" });
    await expect(createSite(signedIn.identity, createSiteSchema.parse({ ...baseSite, code: "SITE-003" }))).rejects.toMatchObject({ code: "FORBIDDEN" });

    await SiteAssignment.updateOne({ organizationId, userId: staff._id }, { $set: { revokedAt: new Date() } });
    const refreshed = await identityFromSessionToken(signedIn.sessionToken);
    expect(refreshed?.siteAssignments).toEqual([]);
    await expect(getSite(refreshed!, assignedSite.id)).rejects.toMatchObject({ code: "SITE_NOT_FOUND" });
  });

  it("stores decimal budgets, checks dates, and audits archive and restore", async () => {
    const company = await owner("Lifecycle Company", "site-lifecycle@example.com");
    const site = await createSite(company.identity, createSiteSchema.parse({ ...baseSite, startDate: "2026-11-01", expectedCompletionDate: "2027-05-01", budget: "1250.5" }));
    expect(site.budget).toBe("1250.50");
    expect((await Site.findById(site.id))?.budget).toBeInstanceOf(mongoose.Types.Decimal128);
    await expect(updateSite(company.identity, site.id, updateSiteSchema.parse({ expectedCompletionDate: "2026-10-01" }))).rejects.toMatchObject({ code: "INVALID_SITE_DATES" });
    const edited = await updateSite(company.identity, site.id, updateSiteSchema.parse({ description: "Main project yard" }));
    expect(edited.description).toBe("Main project yard");
    const archived = await archiveSite(company.identity, site.id);
    expect(archived.status).toBe("ARCHIVED");
    expect((await listSites(company.identity, { limit: 25 })).sites.map((item) => item.id)).not.toContain(site.id);
    expect((await listSites(company.identity, { limit: 25, status: "ARCHIVED" })).sites.map((item) => item.id)).toContain(site.id);
    await expect(updateSite(company.identity, site.id, updateSiteSchema.parse({ name: "Changed" }))).rejects.toMatchObject({ code: "SITE_ARCHIVED" });
    const restored = await restoreSite(company.identity, site.id);
    expect(restored.status).toBe("ACTIVE");
    expect((await Site.findById(site.id))?.deletedAt).toBeNull();
    const actions = await AuditLog.find({ organizationId: new mongoose.Types.ObjectId(company.registered.organization.id), entityType: "site", entityId: site.id }).select("action");
    expect(actions.map((event) => event.action).sort()).toEqual(["site.created", "site.updated", "site.archived", "site.restored"].sort());
    expect(createSiteSchema.safeParse({ ...baseSite, budget: "1.234" }).success).toBe(false);
    expect(createSiteSchema.safeParse({ ...baseSite, startDate: "2026-02-30" }).success).toBe(false);
  });
});
