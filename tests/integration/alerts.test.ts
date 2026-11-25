import { afterAll, beforeAll, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { Alert } from "@/modules/alerts/models/alert";
import { acknowledgeAlert, getAlert, listAlerts } from "@/modules/alerts/services/stock-alert-service";
import { listAlertsSchema } from "@/modules/alerts/schemas/alert";
import { Membership, User } from "@/modules/auth/models/identity";
import { login, registerCompany } from "@/modules/auth/services/auth-service";
import { hashPassword } from "@/modules/auth/services/security";
import { createConsumptionSchema } from "@/modules/consumption/schemas/consumption";
import { createConsumption, reverseConsumption } from "@/modules/consumption/services/consumption-service";
import { createAdjustment } from "@/modules/inventory/services/inventory-adjustment-service";
import { createMaterialSchema } from "@/modules/materials/schemas/catalogue";
import { createCategory } from "@/modules/materials/services/category-service";
import { createMaterial, updateMaterial } from "@/modules/materials/services/material-service";
import { createSiteSchema } from "@/modules/sites/schemas/site";
import { createSite } from "@/modules/sites/services/site-service";
import { approveTransfer, closeTransfer, requestTransfer } from "@/modules/transfers/services/transfer-service";
import { createTransferSchema } from "@/modules/transfers/schemas/transfer";
import { SiteAssignment } from "@/modules/users/models/site-assignment";

let replicaSet: MongoMemoryReplSet;
async function fixture(label: string, email: string, minimum = "10") {
  const password = "strong-password-123";
  const company = await registerCompany({ companyName: label, ownerName: "Owner", email, password, currencyCode: "EUR" }, null);
  const identity = (await login({ email, password }, null, null)).identity;
  const source = await createSite(identity, createSiteSchema.parse({ code: "SOURCE", name: "Source Yard", location: { city: "Berlin", country: "Germany" }, status: "ACTIVE" }));
  const destination = await createSite(identity, createSiteSchema.parse({ code: "DEST", name: "Destination Yard", location: { city: "Berlin", country: "Germany" }, status: "ACTIVE" }));
  const category = await createCategory(identity, { name: "Materials" });
  const material = await createMaterial(identity, createMaterialSchema.parse({ code: "MAT-001", name: "Cement", categoryId: category.id, unit: "BAG", minimumStockLevel: minimum }));
  return { company, identity, source, destination, material };
}
async function adjust(f: Awaited<ReturnType<typeof fixture>>, direction: "IN" | "OUT", quantity: string, key: string) {
  return createAdjustment(f.identity, { siteId: f.source.id, materialId: f.material.id, direction, quantity, ...(direction === "IN" ? { unitCost: "7.40" } : {}), reasonCode: "PHYSICAL_COUNT_CORRECTION", remarks: "Count confirmed at source yard" }, key);
}

beforeAll(async () => {
  replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = replicaSet.getUri();
  process.env.MONGODB_DB_NAME = "constructstock_alerts_test";
  process.env.APP_URL = "http://localhost:3000";
  process.env.TOKEN_PEPPER = "test-only-pepper-with-more-than-thirty-two-characters";
});
afterAll(async () => { await mongoose.disconnect(); globalThis.constructStockMongoose = undefined; await replicaSet?.stop(); });

describe("stock alerts", () => {
  it("initializes alerts for pre-existing low balances once per organization", async () => {
    const f = await fixture("Alert Migration", "alert-migration@example.com");
    await adjust(f, "IN", "5", "alert-migration-in-001");
    await Alert.deleteMany({ organizationId: f.company.organization.id });
    const first = (await listAlerts(f.identity, listAlertsSchema.parse({}))).alerts[0];
    expect([first.available, first.triggerSource]).toEqual(["5", "EXISTING_BALANCE_SCAN"]);
    await listAlerts(f.identity, listAlertsSchema.parse({}));
    expect(await Alert.countDocuments({ organizationId: f.company.organization.id })).toBe(1);
  });

  it("opens at the minimum, escalates at zero, and resolves only above the minimum", async () => {
    const f = await fixture("Alert Lifecycle", "alert-lifecycle@example.com");
    await adjust(f, "IN", "20", "alert-lifecycle-in-001");
    expect(await Alert.countDocuments({ organizationId: f.company.organization.id })).toBe(0);
    await adjust(f, "OUT", "10", "alert-lifecycle-out-001");
    const first = (await listAlerts(f.identity, listAlertsSchema.parse({}))).alerts[0];
    expect([first.type, first.status, first.available, first.minimum]).toEqual(["LOW_STOCK", "OPEN", "10", "10"]);
    await acknowledgeAlert(f.identity, first.id, "Replenishment is being arranged");
    expect((await getAlert(f.identity, first.id)).status).toBe("ACKNOWLEDGED");
    await adjust(f, "OUT", "10", "alert-lifecycle-out-002");
    const critical = await getAlert(f.identity, first.id);
    expect([critical.type, critical.status, critical.available]).toEqual(["OUT_OF_STOCK", "OPEN", "0"]);
    expect(critical.history.map((event) => event.event)).toEqual(["TRIGGERED", "ACKNOWLEDGED", "ESCALATED"]);
    await adjust(f, "IN", "10", "alert-lifecycle-in-002");
    expect((await getAlert(f.identity, first.id)).status).toBe("OPEN");
    await adjust(f, "IN", "1", "alert-lifecycle-in-003");
    const resolved = await getAlert(f.identity, first.id);
    expect([resolved.status, resolved.available, resolved.resolutionReason]).toEqual(["RESOLVED", "11", "STOCK_RECOVERED"]);
    expect((await listAlerts(f.identity, listAlertsSchema.parse({}))).summary.active).toBe(0);
    await adjust(f, "OUT", "1", "alert-lifecycle-out-003");
    expect(await Alert.countDocuments({ organizationId: f.company.organization.id })).toBe(2);
    expect(await Alert.countDocuments({ organizationId: f.company.organization.id, resolvedAt: null })).toBe(1);
  });

  it("reconciles threshold edits and transfer reservations without duplicate active alerts", async () => {
    const f = await fixture("Alert Threshold", "alert-threshold@example.com", "0");
    await adjust(f, "IN", "50", "alert-threshold-in-001");
    await updateMaterial(f.identity, f.material.id, { minimumStockLevel: "55" });
    expect((await listAlerts(f.identity, listAlertsSchema.parse({}))).alerts[0].type).toBe("LOW_STOCK");
    await updateMaterial(f.identity, f.material.id, { minimumStockLevel: "20" });
    expect((await listAlerts(f.identity, listAlertsSchema.parse({}))).summary.active).toBe(0);
    const transfer = await requestTransfer(f.identity, createTransferSchema.parse({ sourceSiteId: f.source.id, destinationSiteId: f.destination.id, materialId: f.material.id, quantity: "35", reason: "SITE_SHORTAGE", purpose: "Destination slab work" }), "alert-transfer-request-001");
    await approveTransfer(f.identity, transfer.id, "alert-transfer-approve-001");
    expect((await listAlerts(f.identity, listAlertsSchema.parse({}))).alerts[0].available).toBe("15");
    await closeTransfer(f.identity, transfer.id, "cancel", "Destination no longer needs cement", "alert-transfer-cancel-001");
    expect((await listAlerts(f.identity, listAlertsSchema.parse({}))).summary.active).toBe(0);
  });

  it("opens on FIFO consumption and resolves after its audited reversal", async () => {
    const f = await fixture("Alert Consumption", "alert-consumption@example.com");
    await adjust(f, "IN", "20", "alert-consumption-in-001");
    const consumption = await createConsumption(f.identity, createConsumptionSchema.parse({ siteId: f.source.id, materialId: f.material.id, quantity: "10", issuedAt: "2026-11-24T11:30:00.000Z", activity: "Foundation pour", issuedTo: "Crew A", allocationMethod: "FIFO" }), "alert-consumption-001");
    const opened = (await listAlerts(f.identity, listAlertsSchema.parse({}))).alerts[0];
    expect([opened.type, opened.available, opened.triggerSource]).toEqual(["LOW_STOCK", "10", "MATERIAL_CONSUMPTION"]);
    await reverseConsumption(f.identity, consumption.id, "Issued to the wrong crew", "alert-consumption-reverse-001");
    expect((await getAlert(f.identity, opened.id)).resolutionReason).toBe("STOCK_RECOVERED");
  });

  it("scopes list, detail, and acknowledgment to assigned sites and organizations", async () => {
    const f = await fixture("Alert Access", "alert-access@example.com");
    const other = await fixture("Alert Other", "alert-other@example.com");
    await adjust(f, "IN", "5", "alert-access-in-001");
    const alert = (await listAlerts(f.identity, listAlertsSchema.parse({}))).alerts[0];
    await expect(getAlert(other.identity, alert.id)).rejects.toMatchObject({ code: "ALERT_NOT_FOUND" });
    const worker = await User.create({ name: "Storekeeper", email: "alert-worker@example.com", passwordHash: await hashPassword("staff-password-123") });
    const organizationId = new mongoose.Types.ObjectId(f.company.organization.id);
    await Membership.create({ organizationId, userId: worker._id, role: "STOREKEEPER", status: "ACTIVE" });
    await SiteAssignment.create({ organizationId, siteId: new mongoose.Types.ObjectId(f.destination.id), userId: worker._id, assignedBy: new mongoose.Types.ObjectId(f.company.user.id) });
    const staff = (await login({ email: worker.email, password: "staff-password-123" }, null, null)).identity;
    expect((await listAlerts(staff, listAlertsSchema.parse({}))).alerts).toEqual([]);
    await expect(getAlert(staff, alert.id)).rejects.toMatchObject({ code: "SITE_NOT_FOUND" });
    await expect(acknowledgeAlert(staff, alert.id)).rejects.toMatchObject({ code: "SITE_NOT_FOUND" });
  });
});
