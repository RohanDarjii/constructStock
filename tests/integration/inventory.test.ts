import { afterAll, beforeAll, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { AuditLog } from "@/modules/audit/models/audit-log";
import { Membership, User } from "@/modules/auth/models/identity";
import { login, registerCompany } from "@/modules/auth/services/auth-service";
import { hashPassword } from "@/modules/auth/services/security";
import { IdempotencyKey } from "@/modules/inventory/models/idempotency-key";
import { InventoryBalance } from "@/modules/inventory/models/inventory-balance";
import { InventoryBatch } from "@/modules/inventory/models/inventory-batch";
import { InventoryTransaction } from "@/modules/inventory/models/inventory-transaction";
import { adjustmentSchema } from "@/modules/inventory/schemas/inventory";
import { createAdjustment } from "@/modules/inventory/services/inventory-adjustment-service";
import { getBalance, getBatch, getTransaction, listBalances, listBatches, listTransactions } from "@/modules/inventory/services/inventory-read-service";
import { createCategory } from "@/modules/materials/services/category-service";
import { archiveMaterial, createMaterial, updateMaterial } from "@/modules/materials/services/material-service";
import { createMaterialSchema } from "@/modules/materials/schemas/catalogue";
import { archiveSite, createSite } from "@/modules/sites/services/site-service";
import { createSiteSchema } from "@/modules/sites/schemas/site";
import { SiteAssignment } from "@/modules/users/models/site-assignment";

let replicaSet: MongoMemoryReplSet;

async function fixture(companyName: string, email: string, unit: "BAG" | "KG" = "BAG") {
  const password = "strong-password-123";
  const company = await registerCompany({ companyName, ownerName: "Owner", email, password, currencyCode: "EUR" }, null);
  const identity = (await login({ email, password }, null, null)).identity;
  const site = await createSite(identity, createSiteSchema.parse({ code: "SITE-001", name: "Main Site", location: { city: "Berlin", country: "Germany" }, status: "ACTIVE" }));
  const category = await createCategory(identity, { name: "Aggregate" });
  const material = await createMaterial(identity, createMaterialSchema.parse({ code: "MAT-001", name: "Test Material", categoryId: category.id, unit, minimumStockLevel: unit === "BAG" ? "5" : "0.5" }));
  return { company, identity, site, material };
}

function adjustment(siteId: string, materialId: string, direction: "IN" | "OUT", quantity: string, extra: Record<string, unknown> = {}) {
  return adjustmentSchema.parse({ siteId, materialId, direction, quantity, reasonCode: direction === "IN" ? "OPENING_STOCK" : "PHYSICAL_COUNT_CORRECTION", remarks: "Verified physical stock count", ...(direction === "IN" ? { unitCost: "2.50" } : {}), ...extra });
}

beforeAll(async () => {
  replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = replicaSet.getUri();
  process.env.MONGODB_DB_NAME = "constructstock_inventory_test";
  process.env.APP_URL = "http://localhost:3000";
  process.env.TOKEN_PEPPER = "test-only-pepper-with-more-than-thirty-two-characters";
});

afterAll(async () => {
  await mongoose.disconnect();
  globalThis.constructStockMongoose = undefined;
  await replicaSet?.stop();
});

describe("inventory ledger, batches, and balances", () => {
  it("posts opening stock atomically and replays the idempotent result", async () => {
    const owner = await fixture("Opening Stock", "inventory-opening@example.com");
    const input = adjustment(owner.site.id, owner.material.id, "IN", "10");
    const created = await createAdjustment(owner.identity, input, "opening-stock-001");
    expect(created.batchIds).toHaveLength(1);
    expect(await createAdjustment(owner.identity, input, "opening-stock-001")).toEqual(created);
    await expect(createAdjustment(owner.identity, adjustment(owner.site.id, owner.material.id, "IN", "9"), "opening-stock-001")).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
    const balances = await listBalances(owner.identity, { limit: 25 });
    expect(balances.balances).toHaveLength(1);
    expect(balances.balances[0]).toMatchObject({ onHandQuantity: "10", reservedQuantity: "0", availableQuantity: "10", inventoryValue: "25.00", lowStock: false });
    expect((await listBalances(owner.identity, { limit: 25, lowStock: "true" })).balances).toHaveLength(0);
    expect((await listBalances(owner.identity, { limit: 25, lowStock: "false" })).balances).toHaveLength(1);
    expect((await getBalance(owner.identity, balances.balances[0].id)).id).toBe(balances.balances[0].id);
    expect((await listBatches(owner.identity, { limit: 25 })).batches).toHaveLength(1);
    expect((await getBatch(owner.identity, created.batchIds[0])).batchCode).toMatch(/^OPEN-/);
    const ledger = await listTransactions(owner.identity, { limit: 25 });
    expect(ledger.transactions).toHaveLength(1);
    expect(ledger.transactions[0]).toMatchObject({ type: "ADJUSTMENT_IN", quantity: "10", referenceId: created.id });
    expect((await getTransaction(owner.identity, ledger.transactions[0].id)).id).toBe(ledger.transactions[0].id);
    expect(await InventoryTransaction.countDocuments()).toBe(1);
    expect(await IdempotencyKey.countDocuments()).toBe(1);
    expect((await AuditLog.find({ action: "inventory.adjusted" })).length).toBe(1);
    await expect(updateMaterial(owner.identity, owner.material.id, { unit: "KG" })).rejects.toMatchObject({ code: "MATERIAL_UNIT_LOCKED" });
    await expect(archiveMaterial(owner.identity, owner.material.id)).rejects.toMatchObject({ code: "MATERIAL_HAS_ACTIVE_STOCK" });
    await expect(archiveSite(owner.identity, owner.site.id)).rejects.toMatchObject({ code: "SITE_HAS_ACTIVE_STOCK" });
  });

  it("uses FIFO, respects reservations, and refuses negative inventory", async () => {
    const owner = await fixture("FIFO Stock", "inventory-fifo@example.com");
    const first = await createAdjustment(owner.identity, adjustment(owner.site.id, owner.material.id, "IN", "10"), "fifo-in-0001");
    const second = await createAdjustment(owner.identity, adjustment(owner.site.id, owner.material.id, "IN", "5", { unitCost: "3.00" }), "fifo-in-0002");
    const before = await listBalances(owner.identity, { limit: 25 });
    expect(before.balances[0].inventoryValue).toBe("40.00");
    const out = await createAdjustment(owner.identity, adjustment(owner.site.id, owner.material.id, "OUT", "12"), "fifo-out-001");
    expect(out.batchIds).toEqual([first.batchIds[0], second.batchIds[0]]);
    const batchOne = await InventoryBatch.findById(first.batchIds[0]);
    const batchTwo = await InventoryBatch.findById(second.batchIds[0]);
    expect(batchOne?.status).toBe("DEPLETED");
    expect(batchOne?.remainingQuantity.toString()).toBe("0");
    expect(batchTwo?.remainingQuantity.toString()).toBe("3");
    const after = (await listBalances(owner.identity, { limit: 25 })).balances[0];
    expect(after).toMatchObject({ onHandQuantity: "3", availableQuantity: "3", inventoryValue: "9.00" });
    expect((await listBalances(owner.identity, { limit: 25, lowStock: "true" })).balances).toHaveLength(1);
    await expect(createAdjustment(owner.identity, adjustment(owner.site.id, owner.material.id, "OUT", "4"), "fifo-out-002")).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
    expect(await InventoryTransaction.countDocuments({ type: "ADJUSTMENT_OUT" })).toBe(2);
    const reserve = mongoose.Types.Decimal128.fromString("2");
    await InventoryBatch.updateOne({ _id: batchTwo!._id }, { $set: { reservedQuantity: reserve } });
    await InventoryBalance.updateOne({ _id: new mongoose.Types.ObjectId(after.id) }, { $set: { reservedQuantity: reserve, availableQuantity: mongoose.Types.Decimal128.fromString("1") } });
    await expect(createAdjustment(owner.identity, adjustment(owner.site.id, owner.material.id, "OUT", "2"), "fifo-out-003")).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
    await createAdjustment(owner.identity, adjustment(owner.site.id, owner.material.id, "OUT", "1"), "fifo-out-004");
    expect((await listBalances(owner.identity, { limit: 25 })).balances[0]).toMatchObject({ onHandQuantity: "2", reservedQuantity: "2", availableQuantity: "0", inventoryValue: "6.00" });
  });

  it("keeps repeated concurrent requests from posting stock twice", async () => {
    const owner = await fixture("Concurrent Stock", "inventory-concurrent@example.com");
    const input = adjustment(owner.site.id, owner.material.id, "IN", "4");
    const results = await Promise.allSettled([
      createAdjustment(owner.identity, input, "concurrent-in-001"),
      createAdjustment(owner.identity, input, "concurrent-in-001"),
    ]);
    expect(results.some((result) => result.status === "fulfilled")).toBe(true);
    expect((await listBalances(owner.identity, { limit: 25 })).balances[0].onHandQuantity).toBe("4");
    expect(await InventoryBatch.countDocuments({ organizationId: owner.company.organization.id, materialId: owner.material.id })).toBe(1);
    expect(await InventoryTransaction.countDocuments({ organizationId: owner.company.organization.id, materialId: owner.material.id })).toBe(1);
    expect(await IdempotencyKey.countDocuments({ organizationId: owner.company.organization.id, key: "concurrent-in-001" })).toBe(1);
  });

  it("scopes reads and adjustments to the company and assigned sites", async () => {
    const first = await fixture("First Inventory", "inventory-first@example.com", "KG");
    const second = await fixture("Second Inventory", "inventory-second@example.com", "KG");
    expect(adjustmentSchema.safeParse({ ...adjustment(first.site.id, first.material.id, "IN", "1"), quantity: "1.2345" }).success).toBe(false);
    await expect(createAdjustment(first.identity, adjustment(second.site.id, first.material.id, "IN", "1"), "wrong-site-01")).rejects.toMatchObject({ code: "SITE_NOT_FOUND" });
    await expect(createAdjustment(first.identity, adjustment(first.site.id, second.material.id, "IN", "1"), "wrong-mat-001")).rejects.toMatchObject({ code: "MATERIAL_NOT_FOUND" });
    await createAdjustment(first.identity, adjustment(first.site.id, first.material.id, "IN", "1.125"), "first-kg-001");
    const firstBalance = (await listBalances(first.identity, { limit: 25 })).balances[0];
    expect(firstBalance.onHandQuantity).toBe("1.125");
    expect((await listBalances(second.identity, { limit: 25 })).balances).toEqual([]);
    await expect(getBalance(second.identity, firstBalance.id)).rejects.toMatchObject({ code: "INVENTORY_NOT_FOUND" });
    const staff = await User.create({ name: "Storekeeper", email: "inventory-staff@example.com", passwordHash: await hashPassword("staff-password-123") });
    const organizationId = new mongoose.Types.ObjectId(first.company.organization.id);
    await Membership.create({ organizationId, userId: staff._id, role: "STOREKEEPER", status: "ACTIVE" });
    await SiteAssignment.create({ organizationId, siteId: new mongoose.Types.ObjectId(first.site.id), userId: staff._id, assignedBy: new mongoose.Types.ObjectId(first.company.user.id) });
    const staffIdentity = (await login({ email: staff.email, password: "staff-password-123" }, null, null)).identity;
    expect((await listBalances(staffIdentity, { limit: 25 })).balances).toHaveLength(1);
    await expect(createAdjustment(staffIdentity, adjustment(first.site.id, first.material.id, "IN", "1"), "staff-in-0001")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(listBalances(staffIdentity, { limit: 25, siteId: second.site.id })).rejects.toMatchObject({ code: "SITE_NOT_FOUND" });
  });
});
