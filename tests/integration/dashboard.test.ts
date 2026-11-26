import { afterAll, beforeAll, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { Membership, User } from "@/modules/auth/models/identity";
import { login, registerCompany } from "@/modules/auth/services/auth-service";
import { hashPassword } from "@/modules/auth/services/security";
import { createConsumptionSchema } from "@/modules/consumption/schemas/consumption";
import { createConsumption } from "@/modules/consumption/services/consumption-service";
import { createAdjustment } from "@/modules/inventory/services/inventory-adjustment-service";
import { createMaterialSchema } from "@/modules/materials/schemas/catalogue";
import { createCategory } from "@/modules/materials/services/category-service";
import { createMaterial } from "@/modules/materials/services/material-service";
import { getDashboard } from "@/modules/dashboard/services/dashboard-service";
import { Site } from "@/modules/sites/models/site";
import { createSiteSchema } from "@/modules/sites/schemas/site";
import { createSite } from "@/modules/sites/services/site-service";
import { SiteAssignment } from "@/modules/users/models/site-assignment";

let replicaSet: MongoMemoryReplSet;

async function company(label: string, email: string) {
  const password = "strong-password-123";
  const registered = await registerCompany({ companyName: label, ownerName: "Owner", email, password, currencyCode: "EUR" }, null);
  const identity = (await login({ email, password }, null, null)).identity;
  const first = await createSite(identity, createSiteSchema.parse({ code: "FIRST", name: "First Yard", location: { city: "Berlin", country: "Germany" }, status: "ACTIVE" }));
  const second = await createSite(identity, createSiteSchema.parse({ code: "SECOND", name: "Second Yard", location: { city: "Berlin", country: "Germany" }, status: "ACTIVE" }));
  const category = await createCategory(identity, { name: "Concrete" });
  const material = await createMaterial(identity, createMaterialSchema.parse({ code: "MAT-001", name: "Cement", categoryId: category.id, unit: "BAG", minimumStockLevel: "0" }));
  return { registered, identity, first, second, material };
}

async function stock(identity: Awaited<ReturnType<typeof company>>["identity"], siteId: string, materialId: string, quantity: string, key: string) {
  await createAdjustment(identity, { siteId, materialId, direction: "IN", quantity, unitCost: "2.50", reasonCode: "OPENING_STOCK", remarks: "Verified opening stock" }, key);
}

beforeAll(async () => {
  replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = replicaSet.getUri();
  process.env.MONGODB_DB_NAME = "constructstock_dashboard_test";
  process.env.APP_URL = "http://localhost:3000";
  process.env.TOKEN_PEPPER = "test-only-pepper-with-more-than-thirty-two-characters";
});

afterAll(async () => {
  await mongoose.disconnect();
  globalThis.constructStockMongoose = undefined;
  await replicaSet?.stop();
});

describe("dashboard read model", () => {
  it("aggregates real ledger and balance data without leaking another tenant or assigned site", async () => {
    const first = await company("Dashboard First", "dashboard-first@example.com");
    const other = await company("Dashboard Other", "dashboard-other@example.com");
    await stock(first.identity, first.first.id, first.material.id, "10", "dashboard-first-stock-001");
    await stock(first.identity, first.second.id, first.material.id, "4", "dashboard-second-stock-001");
    await stock(other.identity, other.first.id, other.material.id, "100", "dashboard-other-stock-001");
    await Site.updateOne({ _id: first.second.id }, { $set: { status: "ON_HOLD" } });

    await createConsumption(first.identity, createConsumptionSchema.parse({ siteId: first.first.id, materialId: first.material.id, quantity: "2", issuedAt: new Date().toISOString(), activity: "Foundation pour", issuedTo: "Crew A", allocationMethod: "FIFO" }), "dashboard-consumption-001");

    const owner = await getDashboard(first.identity, {});
    expect(owner.metrics).toMatchObject({ activeSites: 1, totalMaterials: 1, inventoryValue: "30.00", todayConsumptionValue: "5.00", monthlyConsumptionValue: "5.00" });
    expect(owner.sites.map((site) => site.id)).toContain(first.second.id);
    expect(owner.charts.consumptionTrend.some((period) => period.value === "5.00")).toBe(true);
    expect(owner.charts.inventoryValueBySite.map((site) => site.value).sort()).toEqual(["10.00", "20.00"]);
    expect(owner.inventory).toHaveLength(2);
    expect(owner.recentTransactions.length).toBeGreaterThan(0);

    const user = await User.create({ name: "Storekeeper", email: "dashboard-staff@example.com", passwordHash: await hashPassword("staff-password-123") });
    const organizationId = new mongoose.Types.ObjectId(first.registered.organization.id);
    await Membership.create({ organizationId, userId: user._id, role: "STOREKEEPER", status: "ACTIVE" });
    await SiteAssignment.create({ organizationId, siteId: new mongoose.Types.ObjectId(first.first.id), userId: user._id, assignedBy: new mongoose.Types.ObjectId(first.registered.user.id) });
    const staff = (await login({ email: user.email, password: "staff-password-123" }, null, null)).identity;
    const scoped = await getDashboard(staff, {});
    expect(scoped.metrics.inventoryValue).toBe("20.00");
    expect(scoped.inventory).toHaveLength(1);
    expect(scoped.sites.map((site) => site.id)).toEqual([first.first.id]);
    await expect(getDashboard(staff, { siteId: first.second.id })).rejects.toMatchObject({ code: "SITE_NOT_FOUND" });
    await expect(getDashboard(first.identity, { siteId: other.first.id })).rejects.toMatchObject({ code: "SITE_NOT_FOUND" });
    expect((await getDashboard(other.identity, {})).metrics.inventoryValue).toBe("250.00");
  });

  it("switches to monthly buckets for a longer range", async () => {
    const first = await company("Dashboard Range", "dashboard-range@example.com");
    const to = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - 40 * 86_400_000).toISOString().slice(0, 10);
    const data = await getDashboard(first.identity, { from, to });
    expect(data.charts.trendGrouping).toBe("month");
    expect(data.charts.consumptionTrend.every((row) => /^\d{4}-\d{2}$/.test(row.period))).toBe(true);
  });
});
