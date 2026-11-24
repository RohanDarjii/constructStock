import { afterAll, beforeAll, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { AuditLog } from "@/modules/audit/models/audit-log";
import { Membership, User } from "@/modules/auth/models/identity";
import { login, registerCompany } from "@/modules/auth/services/auth-service";
import { hashPassword } from "@/modules/auth/services/security";
import { Consumption } from "@/modules/consumption/models/consumption";
import { createConsumptionSchema } from "@/modules/consumption/schemas/consumption";
import { createConsumption, getConsumption, getIssueOptions, listConsumptions, reverseConsumption } from "@/modules/consumption/services/consumption-service";
import { listConsumptionsSchema } from "@/modules/consumption/schemas/consumption";
import { InventoryBalance } from "@/modules/inventory/models/inventory-balance";
import { InventoryBatch } from "@/modules/inventory/models/inventory-batch";
import { InventoryTransaction } from "@/modules/inventory/models/inventory-transaction";
import { createAdjustment } from "@/modules/inventory/services/inventory-adjustment-service";
import { createCategory } from "@/modules/materials/services/category-service";
import { createMaterial } from "@/modules/materials/services/material-service";
import { createMaterialSchema } from "@/modules/materials/schemas/catalogue";
import { createSite } from "@/modules/sites/services/site-service";
import { createSiteSchema } from "@/modules/sites/schemas/site";
import { SiteAssignment } from "@/modules/users/models/site-assignment";

let replicaSet: MongoMemoryReplSet;

async function fixture(label: string, email: string) {
  const password = "strong-password-123";
  const company = await registerCompany({ companyName: label, ownerName: "Owner", email, password, currencyCode: "EUR" }, null);
  const identity = (await login({ email, password }, null, null)).identity;
  const site = await createSite(identity, createSiteSchema.parse({ code: "SITE-001", name: "Main Site", location: { city: "Berlin", country: "Germany" }, status: "ACTIVE" }));
  const category = await createCategory(identity, { name: "Materials" });
  const material = await createMaterial(identity, createMaterialSchema.parse({ code: "MAT-001", name: "Cement", categoryId: category.id, unit: "BAG", minimumStockLevel: "0" }));
  await createAdjustment(identity, { siteId: site.id, materialId: material.id, direction: "IN", quantity: "50", unitCost: "7.40", reasonCode: "OPENING_STOCK", remarks: "First older batch" }, `${label.replaceAll(" ", "")}-opening-001`);
  await createAdjustment(identity, { siteId: site.id, materialId: material.id, direction: "IN", quantity: "100", unitCost: "7.50", reasonCode: "OPENING_STOCK", remarks: "Second newer batch" }, `${label.replaceAll(" ", "")}-opening-002`);
  return { company, identity, site, material };
}

function issue(f: Awaited<ReturnType<typeof fixture>>, quantity = "120", extra: Record<string, unknown> = {}) {
  return createConsumptionSchema.parse({ siteId: f.site.id, materialId: f.material.id, quantity, issuedAt: "2026-11-24T11:30:00.000Z", activity: "First Floor Slab", issuedTo: "Contractor A", contractor: "Apex Works", description: "Concrete pour", remarks: "Ground floor handover", allocationMethod: "FIFO", ...extra });
}

beforeAll(async () => {
  replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = replicaSet.getUri();
  process.env.MONGODB_DB_NAME = "constructstock_consumption_test";
  process.env.APP_URL = "http://localhost:3000";
  process.env.TOKEN_PEPPER = "test-only-pepper-with-more-than-thirty-two-characters";
});

afterAll(async () => {
  await mongoose.disconnect();
  globalThis.constructStockMongoose = undefined;
  await replicaSet?.stop();
});

describe("material consumption", () => {
  it("allocates oldest available batches, values stock, and replays idempotent requests", async () => {
    const f = await fixture("Consumption FIFO", "consumption-fifo@example.com");
    const input = issue(f);
    const options = await getIssueOptions(f.identity, f.site.id, f.material.id);
    expect(options.stock?.available).toBe("150");
    const created = await createConsumption(f.identity, input, "consumption-fifo-001");
    expect(created.status).toBe("CONFIRMED");
    expect(await createConsumption(f.identity, input, "consumption-fifo-001")).toEqual(created);
    await expect(createConsumption(f.identity, issue(f, "100"), "consumption-fifo-001")).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
    const detail = await getConsumption(f.identity, created.id);
    expect(detail.batchAllocations.map((entry) => entry.quantity)).toEqual(["50", "70"]);
    expect(detail.valueRemoved).toBe("895.00");
    expect(detail.stockBefore).toBe("150");
    expect(detail.stockAfter).toBe("30");
    expect((await InventoryBalance.findOne({ siteId: f.site.id, materialId: f.material.id }))?.inventoryValue.toString()).toBe("225");
    expect((await InventoryBatch.find({ siteId: f.site.id, materialId: f.material.id }).sort({ receivedAt: 1, _id: 1 })).map((batch) => batch.remainingQuantity.toString())).toEqual(["0", "30"]);
    expect(await InventoryTransaction.countDocuments({ referenceType: "CONSUMPTION", referenceId: created.id, type: "CONSUMPTION" })).toBe(2);
    expect((await listConsumptions(f.identity, listConsumptionsSchema.parse({ siteId: f.site.id }))).consumptions.map((record) => record.id)).toEqual([created.id]);
    expect(await AuditLog.countDocuments({ action: "consumption.confirmed", entityId: created.id })).toBe(1);
  });

  it("blocks over-issue, reserved stock, fractional bags, and foreign tenant or site access", async () => {
    const f = await fixture("Consumption Guards", "consumption-guards@example.com");
    const other = await fixture("Consumption Other", "consumption-other@example.com");
    await expect(createConsumption(f.identity, issue(f, "151"), "consumption-over-001")).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
    await expect(createConsumption(f.identity, issue(f, "0.5"), "consumption-unit-001")).rejects.toMatchObject({ code: "INVALID_ISSUE_QUANTITY" });
    await expect(createConsumption(other.identity, issue(f), "consumption-tenant-001")).rejects.toMatchObject({ code: "SITE_NOT_FOUND" });
    const batch = await InventoryBatch.findOne({ siteId: f.site.id, materialId: f.material.id }).sort({ receivedAt: 1, _id: 1 });
    const balance = await InventoryBalance.findOne({ siteId: f.site.id, materialId: f.material.id });
    batch!.reservedQuantity = mongoose.Types.Decimal128.fromString("30"); await batch!.save();
    balance!.reservedQuantity = mongoose.Types.Decimal128.fromString("30"); balance!.availableQuantity = mongoose.Types.Decimal128.fromString("120"); await balance!.save();
    await expect(createConsumption(f.identity, issue(f, "121"), "consumption-reserved-001")).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
    const created = await createConsumption(f.identity, issue(f, "120"), "consumption-reserved-002");
    expect((await getConsumption(f.identity, created.id)).batchAllocations.map((entry) => entry.quantity)).toEqual(["20", "100"]);
    expect((await InventoryBalance.findOne({ siteId: f.site.id, materialId: f.material.id }))?.reservedQuantity.toString()).toBe("30");
  });

  it("requires elevated permission and an allocation reason for manual batches", async () => {
    const f = await fixture("Consumption Manual", "consumption-manual@example.com");
    const batches = await InventoryBatch.find({ siteId: f.site.id, materialId: f.material.id }).sort({ receivedAt: 1, _id: 1 });
    const manual = issue(f, "10", { allocationMethod: "MANUAL", batchAllocations: [{ batchId: batches[1]._id.toString(), quantity: "10" }], overrideReason: "Use newer sealed batch" });
    const worker = await User.create({ name: "Storekeeper", email: "consumption-storekeeper@example.com", passwordHash: await hashPassword("staff-password-123") });
    const organizationId = new mongoose.Types.ObjectId(f.company.organization.id);
    await Membership.create({ organizationId, userId: worker._id, role: "STOREKEEPER", status: "ACTIVE" });
    await SiteAssignment.create({ organizationId, siteId: new mongoose.Types.ObjectId(f.site.id), userId: worker._id, assignedBy: new mongoose.Types.ObjectId(f.company.user.id) });
    const staff = (await login({ email: worker.email, password: "staff-password-123" }, null, null)).identity;
    await expect(createConsumption(staff, manual, "consumption-manual-staff-001")).rejects.toMatchObject({ code: "FORBIDDEN" });
    const created = await createConsumption(f.identity, manual, "consumption-manual-owner-001");
    expect((await getConsumption(f.identity, created.id)).batchAllocations[0].batchId).toBe(batches[1]._id.toString());
    expect((await InventoryBatch.findById(batches[0]._id))?.remainingQuantity.toString()).toBe("50");
  });

  it("reverses to the original batches with compensating ledger entries", async () => {
    const f = await fixture("Consumption Reversal", "consumption-reversal@example.com");
    const created = await createConsumption(f.identity, issue(f), "consumption-reversal-001");
    const reversed = await reverseConsumption(f.identity, created.id, "Issue entered for wrong work activity", "consumption-reverse-001");
    expect(reversed.status).toBe("REVERSED");
    expect(await reverseConsumption(f.identity, created.id, "Issue entered for wrong work activity", "consumption-reverse-001")).toEqual(reversed);
    expect((await Consumption.findById(created.id))?.status).toBe("REVERSED");
    expect((await InventoryBatch.find({ siteId: f.site.id, materialId: f.material.id }).sort({ receivedAt: 1, _id: 1 })).map((batch) => batch.remainingQuantity.toString())).toEqual(["50", "100"]);
    expect((await InventoryBalance.findOne({ siteId: f.site.id, materialId: f.material.id }))?.inventoryValue.toString()).toBe("1120");
    expect(await InventoryTransaction.countDocuments({ referenceId: created.id, type: "REVERSAL" })).toBe(2);
    await expect(reverseConsumption(f.identity, created.id, "Issue entered for wrong work activity", "consumption-reverse-002")).rejects.toMatchObject({ code: "CONSUMPTION_NOT_REVERSIBLE" });
  });

  it("serializes competing issues so site stock never goes negative", async () => {
    const f = await fixture("Consumption Concurrent", "consumption-concurrent@example.com");
    const results = await Promise.allSettled([
      createConsumption(f.identity, issue(f, "100"), "consumption-concurrent-a"),
      createConsumption(f.identity, issue(f, "100"), "consumption-concurrent-b"),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect((await InventoryBalance.findOne({ siteId: f.site.id, materialId: f.material.id }))?.onHandQuantity.toString()).toBe("50");
    expect(await Consumption.countDocuments({ siteId: f.site.id, materialId: f.material.id })).toBe(1);
  });
});
