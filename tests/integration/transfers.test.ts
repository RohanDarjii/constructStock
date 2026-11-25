import { afterAll, beforeAll, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { AuditLog } from "@/modules/audit/models/audit-log";
import { Membership, User } from "@/modules/auth/models/identity";
import { login, registerCompany } from "@/modules/auth/services/auth-service";
import { hashPassword } from "@/modules/auth/services/security";
import { createConsumptionSchema } from "@/modules/consumption/schemas/consumption";
import { createConsumption } from "@/modules/consumption/services/consumption-service";
import { InventoryBalance } from "@/modules/inventory/models/inventory-balance";
import { InventoryBatch } from "@/modules/inventory/models/inventory-batch";
import { IdempotencyKey } from "@/modules/inventory/models/idempotency-key";
import { InventoryTransaction } from "@/modules/inventory/models/inventory-transaction";
import { createAdjustment } from "@/modules/inventory/services/inventory-adjustment-service";
import { createMaterialSchema } from "@/modules/materials/schemas/catalogue";
import { createCategory } from "@/modules/materials/services/category-service";
import { createMaterial } from "@/modules/materials/services/material-service";
import { createSiteSchema } from "@/modules/sites/schemas/site";
import { archiveSite, createSite } from "@/modules/sites/services/site-service";
import { createTransferSchema, listTransfersSchema } from "@/modules/transfers/schemas/transfer";
import { approveTransfer, closeTransfer, dispatchTransfer, getTransfer, getTransferOptions, listTransfers, receiveTransfer, requestTransfer } from "@/modules/transfers/services/transfer-service";
import { SiteAssignment } from "@/modules/users/models/site-assignment";

let replicaSet: MongoMemoryReplSet;

async function fixture(label: string, email: string, unit: "BAG" | "KG" = "BAG") {
  const password = "strong-password-123";
  const company = await registerCompany({ companyName: label, ownerName: "Owner", email, password, currencyCode: "EUR" }, null);
  const identity = (await login({ email, password }, null, null)).identity;
  const source = await createSite(identity, createSiteSchema.parse({ code: "SOURCE", name: "Source Yard", location: { city: "Berlin", country: "Germany" }, status: "ACTIVE" }));
  const destination = await createSite(identity, createSiteSchema.parse({ code: "DEST", name: "Destination Yard", location: { city: "Berlin", country: "Germany" }, status: "ACTIVE" }));
  const category = await createCategory(identity, { name: "Materials" });
  const material = await createMaterial(identity, createMaterialSchema.parse({ code: "MAT-001", name: "Cement", categoryId: category.id, unit, minimumStockLevel: "0" }));
  await createAdjustment(identity, { siteId: source.id, materialId: material.id, direction: "IN", quantity: "50", unitCost: "7.40", reasonCode: "OPENING_STOCK", remarks: "Older batch" }, `${label.replaceAll(" ", "")}-opening-001`);
  await createAdjustment(identity, { siteId: source.id, materialId: material.id, direction: "IN", quantity: "100", unitCost: "7.50", reasonCode: "OPENING_STOCK", remarks: "Newer batch" }, `${label.replaceAll(" ", "")}-opening-002`);
  return { company, identity, source, destination, material };
}

function input(f: Awaited<ReturnType<typeof fixture>>, quantity = "120") {
  return createTransferSchema.parse({ sourceSiteId: f.source.id, destinationSiteId: f.destination.id, materialId: f.material.id, quantity, reason: "SITE_SHORTAGE", purpose: "First floor slab pour", targetDate: "2026-12-01", notes: "Keep dry" });
}

beforeAll(async () => {
  replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = replicaSet.getUri();
  process.env.MONGODB_DB_NAME = "constructstock_transfers_test";
  process.env.APP_URL = "http://localhost:3000";
  process.env.TOKEN_PEPPER = "test-only-pepper-with-more-than-thirty-two-characters";
});
afterAll(async () => { await mongoose.disconnect(); globalThis.constructStockMongoose = undefined; await replicaSet?.stop(); });

describe("inter-site material transfers", () => {
  it("reserves FIFO stock, dispatches into transit, and receives linked batches without losing value", async () => {
    const f = await fixture("Transfer Lifecycle", "transfer-lifecycle@example.com");
    const requested = await requestTransfer(f.identity, input(f), "transfer-request-lifecycle-001");
    expect(await requestTransfer(f.identity, input(f), "transfer-request-lifecycle-001")).toEqual(requested);
    expect((await InventoryBalance.findOne({ siteId: f.source.id, materialId: f.material.id }))?.availableQuantity.toString()).toBe("150");
    expect((await getTransferOptions(f.identity, f.source.id, f.material.id)).stock?.available).toBe("150");
    const approved = await approveTransfer(f.identity, requested.id, "transfer-approve-lifecycle-001");
    expect(approved.status).toBe("APPROVED");
    expect(await approveTransfer(f.identity, requested.id, "transfer-approve-lifecycle-001")).toEqual(approved);
    let balance = await InventoryBalance.findOne({ siteId: f.source.id, materialId: f.material.id });
    expect([balance?.onHandQuantity.toString(), balance?.reservedQuantity.toString(), balance?.availableQuantity.toString(), balance?.inventoryValue.toString()]).toEqual(["150", "120", "30", "1120"]);
    expect((await getTransfer(f.identity, requested.id)).allocations.map((entry) => entry.quantity)).toEqual(["50", "70"]);
    await expect(createConsumption(f.identity, createConsumptionSchema.parse({ siteId: f.source.id, materialId: f.material.id, quantity: "31", issuedAt: "2026-11-25T10:00:00.000Z", activity: "Slab work", issuedTo: "Crew A", allocationMethod: "FIFO" }), "transfer-reserved-issue-001")).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
    expect(await IdempotencyKey.countDocuments({ organizationId: f.company.organization.id, operation: "transfer.approve" })).toBe(1);
    expect(await AuditLog.countDocuments({ entityId: requested.id, action: "transfer.approved" })).toBe(1);
    expect(await InventoryTransaction.countDocuments({ referenceId: requested.id, type: "TRANSFER_RESERVE" })).toBe(2);
    const dispatched = await dispatchTransfer(f.identity, requested.id, "transfer-dispatch-lifecycle-001");
    expect(dispatched.status).toBe("DISPATCHED");
    expect(await dispatchTransfer(f.identity, requested.id, "transfer-dispatch-lifecycle-001")).toEqual(dispatched);
    balance = await InventoryBalance.findOne({ siteId: f.source.id, materialId: f.material.id });
    expect([balance?.onHandQuantity.toString(), balance?.reservedQuantity.toString(), balance?.availableQuantity.toString(), balance?.inventoryValue.toString()]).toEqual(["30", "0", "30", "225"]);
    expect(await InventoryBalance.findOne({ siteId: f.destination.id, materialId: f.material.id })).toBeNull();
    expect((await getTransfer(f.identity, requested.id)).inTransitValue).toBe("895.00");
    const received = await receiveTransfer(f.identity, requested.id, "transfer-receive-lifecycle-001");
    expect(received.status).toBe("RECEIVED");
    expect(await receiveTransfer(f.identity, requested.id, "transfer-receive-lifecycle-001")).toEqual(received);
    const destination = await InventoryBalance.findOne({ siteId: f.destination.id, materialId: f.material.id });
    expect([destination?.onHandQuantity.toString(), destination?.availableQuantity.toString(), destination?.inventoryValue.toString()]).toEqual(["120", "120", "895"]);
    const detail = await getTransfer(f.identity, requested.id);
    expect(detail.inTransitQuantity).toBe("0");
    expect(detail.allocations.every((entry) => entry.destinationBatchId)).toBe(true);
    expect(await InventoryBatch.countDocuments({ sourceTransferId: requested.id, siteId: f.destination.id })).toBe(2);
    expect(await InventoryTransaction.countDocuments({ referenceId: requested.id, type: "TRANSFER_IN" })).toBe(2);
    expect((await listTransfers(f.identity, listTransfersSchema.parse({ status: "RECEIVED" }))).transfers.map((record) => record.id)).toContain(requested.id);
  });

  it("blocks insufficient stock, fractional bags, conflicting keys, and concurrent approvals", async () => {
    const f = await fixture("Transfer Guards", "transfer-guards@example.com");
    await expect(requestTransfer(f.identity, input(f, "0.5"), "transfer-fractional-001")).rejects.toMatchObject({ code: "INVALID_TRANSFER_QUANTITY" });
    const a = await requestTransfer(f.identity, input(f, "100"), "transfer-guards-request-a");
    const b = await requestTransfer(f.identity, input(f, "100"), "transfer-guards-request-b");
    await expect(requestTransfer(f.identity, input(f, "99"), "transfer-guards-request-a")).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
    const outcomes = await Promise.allSettled([approveTransfer(f.identity, a.id, "transfer-guards-approve-a"), approveTransfer(f.identity, b.id, "transfer-guards-approve-b")]);
    expect(outcomes.filter((entry) => entry.status === "fulfilled")).toHaveLength(1);
    expect((await InventoryBalance.findOne({ siteId: f.source.id, materialId: f.material.id }))?.availableQuantity.toString()).toBe("50");
    expect(await InventoryTransaction.countDocuments({ type: "TRANSFER_RESERVE", referenceId: { $in: [a.id, b.id] } })).toBe(2);
  });

  it("releases reservations on cancellation and preserves rejected requests", async () => {
    const f = await fixture("Transfer Closure", "transfer-closure@example.com");
    const requested = await requestTransfer(f.identity, input(f, "40"), "transfer-closure-request-001");
    await approveTransfer(f.identity, requested.id, "transfer-closure-approve-001");
    const closed = await closeTransfer(f.identity, requested.id, "cancel", "Destination no longer needs material", "transfer-closure-cancel-001");
    expect(closed.status).toBe("CANCELLED");
    expect(await closeTransfer(f.identity, requested.id, "cancel", "Destination no longer needs material", "transfer-closure-cancel-001")).toEqual(closed);
    const balance = await InventoryBalance.findOne({ siteId: f.source.id, materialId: f.material.id });
    expect([balance?.onHandQuantity.toString(), balance?.reservedQuantity.toString(), balance?.availableQuantity.toString()]).toEqual(["150", "0", "150"]);
    expect(await InventoryTransaction.countDocuments({ referenceId: requested.id, type: "TRANSFER_RESERVE_RELEASE" })).toBe(1);
    const second = await requestTransfer(f.identity, input(f, "20"), "transfer-closure-request-002");
    await closeTransfer(f.identity, second.id, "reject", "The material is not needed", "transfer-closure-reject-002");
    expect((await getTransfer(f.identity, second.id)).status).toBe("REJECTED");
    const documentedInput = createTransferSchema.parse({ sourceSiteId: f.source.id, destinationSiteId: f.destination.id, materialId: f.material.id, quantity: "5", reason: "Destination site is below minimum stock", remarks: "Required for slab work" });
    const documented = await requestTransfer(f.identity, documentedInput, "transfer-closure-request-003");
    expect((await getTransfer(f.identity, documented.id)).notes).toBe("Required for slab work");
    await expect(dispatchTransfer(f.identity, requested.id, "transfer-closure-dispatch-001")).rejects.toMatchObject({ code: "TRANSFER_STATE_CONFLICT" });
  });

  it("conserves two-decimal inventory value for fractional measurement units", async () => {
    const f = await fixture("Transfer Fractional", "transfer-fractional@example.com", "KG");
    const requested = await requestTransfer(f.identity, input(f, "0.001"), "transfer-fractional-request-001");
    await approveTransfer(f.identity, requested.id, "transfer-fractional-approve-001");
    await dispatchTransfer(f.identity, requested.id, "transfer-fractional-dispatch-001");
    const transit = await getTransfer(f.identity, requested.id);
    expect(transit.inTransitQuantity).toBe("0.001");
    await receiveTransfer(f.identity, requested.id, "transfer-fractional-receive-001");
    const [source, destination] = await Promise.all([
      InventoryBalance.findOne({ siteId: f.source.id, materialId: f.material.id }),
      InventoryBalance.findOne({ siteId: f.destination.id, materialId: f.material.id }),
    ]);
    expect(Number(source?.inventoryValue.toString()) + Number(destination?.inventoryValue.toString())).toBe(1120);
    expect((await getTransfer(f.identity, requested.id)).inTransitValue).toBe("0.00");
    const sourceBatch = await InventoryBatch.findOne({ siteId: f.source.id, materialId: f.material.id }).sort({ receivedAt: 1, _id: 1 });
    const firstBatch = await InventoryBatch.findOne({ sourceTransferId: requested.id });
    expect(firstBatch?.unitCost.toString()).toBe(sourceBatch?.unitCost.toString());
    const second = await requestTransfer(f.identity, input(f, "0.001"), "transfer-fractional-request-002");
    await approveTransfer(f.identity, second.id, "transfer-fractional-approve-002");
    await dispatchTransfer(f.identity, second.id, "transfer-fractional-dispatch-002");
    await receiveTransfer(f.identity, second.id, "transfer-fractional-receive-002");
    const secondDetail = await getTransfer(f.identity, second.id);
    expect(secondDetail.roundingVariance).toBe("0.01");
    expect(secondDetail.receiptValue).toBe("0.01");
    expect((await InventoryBatch.findOne({ sourceTransferId: second.id }))?.unitCost.toString()).toBe(sourceBatch?.unitCost.toString());
  });

  it("enforces tenant boundaries and source/destination site permissions", async () => {
    const f = await fixture("Transfer Access", "transfer-access@example.com");
    const other = await fixture("Transfer Other", "transfer-other@example.com");
    const requested = await requestTransfer(f.identity, input(f, "10"), "transfer-access-request-001");
    await expect(getTransfer(other.identity, requested.id)).rejects.toMatchObject({ code: "TRANSFER_NOT_FOUND" });
    await expect(requestTransfer(other.identity, input(f, "10"), "transfer-access-foreign-001")).rejects.toMatchObject({ code: "SITE_NOT_ACTIVE" });
    const worker = await User.create({ name: "Storekeeper", email: "transfer-worker@example.com", passwordHash: await hashPassword("staff-password-123") });
    const organizationId = new mongoose.Types.ObjectId(f.company.organization.id);
    await Membership.create({ organizationId, userId: worker._id, role: "STOREKEEPER", status: "ACTIVE" });
    await SiteAssignment.create({ organizationId, siteId: new mongoose.Types.ObjectId(f.source.id), userId: worker._id, assignedBy: new mongoose.Types.ObjectId(f.company.user.id) });
    const staff = (await login({ email: worker.email, password: "staff-password-123" }, null, null)).identity;
    expect((await listTransfers(staff, listTransfersSchema.parse({ destinationSiteId: f.destination.id }))).transfers.map((entry) => entry.id)).toContain(requested.id);
    await expect(approveTransfer(staff, requested.id, "transfer-access-approve-001")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await approveTransfer(f.identity, requested.id, "transfer-access-approve-002");
    await dispatchTransfer(staff, requested.id, "transfer-access-dispatch-001");
    await expect(receiveTransfer(staff, requested.id, "transfer-access-receive-001")).rejects.toMatchObject({ code: "SITE_NOT_FOUND" });
    await expect(archiveSite(f.identity, f.destination.id)).rejects.toMatchObject({ code: "SITE_HAS_ACTIVE_STOCK" });
  });
});
