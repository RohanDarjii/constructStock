import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { AuditLog } from "@/modules/audit/models/audit-log";
import { Membership, User } from "@/modules/auth/models/identity";
import { login, registerCompany } from "@/modules/auth/services/auth-service";
import { hashPassword } from "@/modules/auth/services/security";
import { FileAttachment } from "@/modules/files/models/file-attachment";
import { authorizeUploadToken, cleanupStaleUnlinkedAttachments, createPendingAttachment, getAttachment } from "@/modules/files/services/file-attachment-service";
import { InventoryBalance } from "@/modules/inventory/models/inventory-balance";
import { InventoryBatch } from "@/modules/inventory/models/inventory-batch";
import { InventoryTransaction } from "@/modules/inventory/models/inventory-transaction";
import { createAdjustment } from "@/modules/inventory/services/inventory-adjustment-service";
import { createMaterialSchema } from "@/modules/materials/schemas/catalogue";
import { createCategory } from "@/modules/materials/services/category-service";
import { createMaterial } from "@/modules/materials/services/material-service";
import { GoodsReceipt } from "@/modules/receiving/models/goods-receipt";
import { createSiteSchema } from "@/modules/sites/schemas/site";
import { createSite } from "@/modules/sites/services/site-service";
import { SiteAssignment } from "@/modules/users/models/site-assignment";
import { Wastage } from "@/modules/wastage/models/wastage";
import { createWastageSchema, listWastagesSchema } from "@/modules/wastage/schemas/wastage";
import { createWastage, getWastage, getWastageOptions, listWastages, reverseWastage } from "@/modules/wastage/services/wastage-service";

let replicaSet: MongoMemoryReplSet;

vi.mock("@vercel/blob", () => ({ del: vi.fn(async () => undefined), get: vi.fn() }));

async function fixture(label: string, email: string) {
  const password = "strong-password-123";
  const company = await registerCompany({ companyName: label, ownerName: "Owner", email, password, currencyCode: "EUR" }, null);
  const identity = (await login({ email, password }, null, null)).identity;
  const site = await createSite(identity, createSiteSchema.parse({ code: "SITE-001", name: "Main Site", location: { city: "Berlin", country: "Germany" }, status: "ACTIVE" }));
  const category = await createCategory(identity, { name: "Materials" });
  const material = await createMaterial(identity, createMaterialSchema.parse({ code: "MAT-001", name: "Cement", categoryId: category.id, unit: "BAG", minimumStockLevel: "0" }));
  await createAdjustment(identity, { siteId: site.id, materialId: material.id, direction: "IN", quantity: "50", unitCost: "7.40", reasonCode: "OPENING_STOCK", remarks: "Older batch" }, `${label.replaceAll(" ", "")}-opening-001`);
  await createAdjustment(identity, { siteId: site.id, materialId: material.id, direction: "IN", quantity: "100", unitCost: "7.50", reasonCode: "OPENING_STOCK", remarks: "Newer batch" }, `${label.replaceAll(" ", "")}-opening-002`);
  return { company, identity, site, material };
}

function waste(f: Awaited<ReturnType<typeof fixture>>, quantity = "120", extra: Record<string, unknown> = {}) {
  return createWastageSchema.parse({ siteId: f.site.id, materialId: f.material.id, quantity, wastedAt: "2026-11-24T11:30:00.000Z", reason: "BREAKAGE", activity: "Ground floor", notes: "Broken bags", allocationMethod: "FIFO", ...extra });
}

beforeAll(async () => {
  replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = replicaSet.getUri();
  process.env.MONGODB_DB_NAME = "constructstock_wastage_test";
  process.env.APP_URL = "http://localhost:3000";
  process.env.TOKEN_PEPPER = "test-only-pepper-with-more-than-thirty-two-characters";
});

afterAll(async () => {
  await mongoose.disconnect();
  globalThis.constructStockMongoose = undefined;
  await replicaSet?.stop();
});

describe("material wastage", () => {
  it("writes FIFO loss, balance, ledger, audit, and retry result atomically", async () => {
    const f = await fixture("Wastage FIFO", "wastage-fifo@example.com");
    expect((await getWastageOptions(f.identity, f.site.id, f.material.id)).stock?.available).toBe("150");
    const input = waste(f);
    const created = await createWastage(f.identity, input, "wastage-fifo-001");
    expect(await createWastage(f.identity, input, "wastage-fifo-001")).toEqual(created);
    await expect(createWastage(f.identity, waste(f, "20"), "wastage-fifo-001")).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
    const detail = await getWastage(f.identity, created.id);
    expect(detail.batchAllocations.map((entry) => entry.quantity)).toEqual(["50", "70"]);
    expect(detail.valueRemoved).toBe("895.00");
    expect(detail.stockBefore).toBe("150");
    expect(detail.stockAfter).toBe("30");
    expect(detail.onHandAfter).toBe("30");
    expect((await InventoryBalance.findOne({ siteId: f.site.id, materialId: f.material.id }))?.inventoryValue.toString()).toBe("225");
    expect((await InventoryBatch.find({ siteId: f.site.id, materialId: f.material.id }).sort({ receivedAt: 1, _id: 1 })).map((batch) => batch.remainingQuantity.toString())).toEqual(["0", "30"]);
    expect(await InventoryTransaction.countDocuments({ referenceType: "WASTAGE", referenceId: created.id, type: "WASTAGE" })).toBe(2);
    expect(await AuditLog.countDocuments({ action: "wastage.confirmed", entityId: created.id })).toBe(1);
    const list = await listWastages(f.identity, listWastagesSchema.parse({ siteId: f.site.id }));
    expect(list.summary.valueLost).toBe("895.00");
    expect(list.wastages[0].id).toBe(created.id);
  });

  it("blocks over-write-off, reserved stock, fractional bags, and foreign tenants", async () => {
    const f = await fixture("Wastage Guards", "wastage-guards@example.com");
    const other = await fixture("Wastage Other", "wastage-other@example.com");
    await expect(createWastage(f.identity, waste(f, "151"), "wastage-over-001")).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
    await expect(createWastage(f.identity, waste(f, "0.5"), "wastage-unit-001")).rejects.toMatchObject({ code: "INVALID_WASTAGE_QUANTITY" });
    await expect(createWastage(other.identity, waste(f), "wastage-tenant-001")).rejects.toMatchObject({ code: "SITE_NOT_FOUND" });
    const batch = await InventoryBatch.findOne({ siteId: f.site.id, materialId: f.material.id }).sort({ receivedAt: 1, _id: 1 });
    const balance = await InventoryBalance.findOne({ siteId: f.site.id, materialId: f.material.id });
    batch!.reservedQuantity = mongoose.Types.Decimal128.fromString("30"); await batch!.save();
    balance!.reservedQuantity = mongoose.Types.Decimal128.fromString("30"); balance!.availableQuantity = mongoose.Types.Decimal128.fromString("120"); await balance!.save();
    await expect(createWastage(f.identity, waste(f, "121"), "wastage-reserved-001")).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
    const created = await createWastage(f.identity, waste(f, "120"), "wastage-reserved-002");
    expect((await getWastage(f.identity, created.id)).batchAllocations.map((entry) => entry.quantity)).toEqual(["20", "100"]);
    expect((await InventoryBalance.findOne({ siteId: f.site.id, materialId: f.material.id }))?.reservedQuantity.toString()).toBe("30");
  });

  it("governs manual batch selection and links only a ready tenant photo", async () => {
    const f = await fixture("Wastage Manual", "wastage-manual@example.com");
    const batches = await InventoryBatch.find({ siteId: f.site.id, materialId: f.material.id }).sort({ receivedAt: 1, _id: 1 });
    const worker = await User.create({ name: "Storekeeper", email: "wastage-storekeeper@example.com", passwordHash: await hashPassword("staff-password-123") });
    const organizationId = new mongoose.Types.ObjectId(f.company.organization.id);
    await Membership.create({ organizationId, userId: worker._id, role: "STOREKEEPER", status: "ACTIVE" });
    await SiteAssignment.create({ organizationId, siteId: new mongoose.Types.ObjectId(f.site.id), userId: worker._id, assignedBy: new mongoose.Types.ObjectId(f.company.user.id) });
    const staff = (await login({ email: worker.email, password: "staff-password-123" }, null, null)).identity;
    const photo = await FileAttachment.create({ organizationId, siteId: new mongoose.Types.ObjectId(f.site.id), linkedEntityType: "WASTAGE", fileKey: "test/photo.jpg", fileName: "damage.jpg", mimeType: "image/jpeg", size: 100, uploadState: "READY", uploadedBy: new mongoose.Types.ObjectId(f.company.user.id) });
    const manual = waste(f, "10", { allocationMethod: "MANUAL", batchAllocations: [{ batchId: batches[1]._id.toString(), quantity: "10" }], overrideReason: "Use newer sealed batch", attachmentIds: [photo._id.toString()] });
    await expect(createWastage(staff, manual, "wastage-manual-staff-001")).rejects.toMatchObject({ code: "FORBIDDEN" });
    const created = await createWastage(f.identity, manual, "wastage-manual-owner-001");
    expect((await getWastage(f.identity, created.id)).attachments[0].fileName).toBe("damage.jpg");
    expect((await FileAttachment.findById(photo._id))?.linkedEntityId?.toString()).toBe(created.id);
    expect((await getAttachment(f.identity, photo._id.toString())).fileName).toBe("damage.jpg");
    expect((await InventoryBatch.findById(batches[0]._id))?.remainingQuantity.toString()).toBe("50");
    const other = await fixture("Wastage Photo Other", "wastage-photo-other@example.com");
    await expect(getAttachment(other.identity, photo._id.toString())).rejects.toMatchObject({ code: "FILE_NOT_FOUND" });
    const before = (await InventoryBalance.findOne({ siteId: f.site.id, materialId: f.material.id }))?.onHandQuantity.toString();
    await expect(createWastage(f.identity, waste(f, "1", { attachmentIds: [photo._id.toString()] }), "wastage-photo-reuse-001")).rejects.toMatchObject({ code: "FILE_NOT_READY" });
    expect((await InventoryBalance.findOne({ siteId: f.site.id, materialId: f.material.id }))?.onHandQuantity.toString()).toBe(before);
  });

  it("authorizes photo upload by tenant, site, and uploader before stock posting", async () => {
    const f = await fixture("Wastage Photo", "wastage-photo@example.com");
    const other = await fixture("Wastage Photo Foreign", "wastage-photo-foreign@example.com");
    process.env.BLOB_READ_WRITE_TOKEN = "test-private-blob-token";
    try {
      const pending = await createPendingAttachment(f.identity, { siteId: f.site.id, fileName: "broken-bags.jpg", mimeType: "image/jpeg", size: 4096 });
      const tokenOptions = await authorizeUploadToken(f.identity, pending.id, pending.fileKey);
      expect(tokenOptions.allowedContentTypes).toEqual(["image/jpeg"]);
      expect(tokenOptions.maximumSizeInBytes).toBe(4096);
      await expect(authorizeUploadToken(other.identity, pending.id, pending.fileKey)).rejects.toMatchObject({ code: "FILE_NOT_FOUND" });
      await expect(authorizeUploadToken(f.identity, pending.id, "organizations/other/photo.jpg")).rejects.toMatchObject({ code: "FILE_NOT_FOUND" });
      await expect(createWastage(f.identity, waste(f, "1", { attachmentIds: [pending.id] }), "wastage-pending-photo-001")).rejects.toMatchObject({ code: "FILE_NOT_READY" });
      expect((await InventoryBalance.findOne({ siteId: f.site.id, materialId: f.material.id }))?.onHandQuantity.toString()).toBe("150");
    } finally { delete process.env.BLOB_READ_WRITE_TOKEN; }
  });

  it("drains more than one batch of stale uploads while preserving linked evidence", async () => {
    const f = await fixture("Wastage Cleanup", "wastage-cleanup@example.com");
    const organizationId = new mongoose.Types.ObjectId(f.company.organization.id);
    const siteId = new mongoose.Types.ObjectId(f.site.id);
    const uploadedBy = new mongoose.Types.ObjectId(f.company.user.id);
    const old = new Date(Date.now() - 72 * 60 * 60 * 1000);
    const documents = Array.from({ length: 125 }, (_, index) => ({
      organizationId, siteId, linkedEntityType: "WASTAGE" as const, fileKey: `cleanup/photo-${index}.jpg`,
      fileName: `photo-${index}.jpg`, mimeType: "image/jpeg", size: 100, uploadedBy,
      uploadState: "PENDING" as const, createdAt: old, updatedAt: old,
    }));
    await FileAttachment.insertMany(documents);
    const linked = await FileAttachment.create({ ...documents[0], fileKey: "cleanup/linked.jpg", linkedEntityId: new mongoose.Types.ObjectId() });
    await FileAttachment.updateMany({ organizationId, linkedEntityId: null }, { $set: { updatedAt: old } }, { timestamps: false });
    const originalToken = process.env.BLOB_READ_WRITE_TOKEN;
    process.env.BLOB_READ_WRITE_TOKEN = "test-private-blob-token";
    try {
      const result = await cleanupStaleUnlinkedAttachments();
      expect(result).toEqual({ deleted: 125, failed: 0, remaining: false });
      expect(await FileAttachment.countDocuments({ organizationId, linkedEntityId: null })).toBe(0);
      expect(await FileAttachment.exists({ _id: linked._id })).toBeTruthy();
    } finally {
      if (originalToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
      else process.env.BLOB_READ_WRITE_TOKEN = originalToken;
    }
  });

  it("restores original batches with compensating ledger entries", async () => {
    const f = await fixture("Wastage Reversal", "wastage-reversal@example.com");
    const created = await createWastage(f.identity, waste(f), "wastage-reversal-001");
    const reversed = await reverseWastage(f.identity, created.id, "Incorrect wastage record entered", "wastage-reverse-001");
    expect(reversed.status).toBe("REVERSED");
    expect(await reverseWastage(f.identity, created.id, "Incorrect wastage record entered", "wastage-reverse-001")).toEqual(reversed);
    expect((await Wastage.findById(created.id))?.status).toBe("REVERSED");
    expect((await InventoryBatch.find({ siteId: f.site.id, materialId: f.material.id }).sort({ receivedAt: 1, _id: 1 })).map((batch) => batch.remainingQuantity.toString())).toEqual(["50", "100"]);
    expect((await InventoryBalance.findOne({ siteId: f.site.id, materialId: f.material.id }))?.inventoryValue.toString()).toBe("1120");
    expect(await InventoryTransaction.countDocuments({ referenceId: created.id, type: "REVERSAL" })).toBe(2);
    await expect(reverseWastage(f.identity, created.id, "Incorrect wastage record entered", "wastage-reverse-002")).rejects.toMatchObject({ code: "WASTAGE_NOT_REVERSIBLE" });
  });

  it("keeps concurrent losses within available stock and computes receipt based rate", async () => {
    const f = await fixture("Wastage Concurrent", "wastage-concurrent@example.com");
    const results = await Promise.allSettled([createWastage(f.identity, waste(f, "100"), "wastage-concurrent-a"), createWastage(f.identity, waste(f, "100"), "wastage-concurrent-b")]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect((await InventoryBalance.findOne({ siteId: f.site.id, materialId: f.material.id }))?.onHandQuantity.toString()).toBe("50");
    expect(await Wastage.countDocuments({ siteId: f.site.id, materialId: f.material.id })).toBe(1);
    const query = listWastagesSchema.parse({ siteId: f.site.id, materialId: f.material.id });
    expect((await listWastages(f.identity, query)).summary.wastagePercentage).toBeNull();
    await GoodsReceipt.create({ organizationId: f.company.organization.id, siteId: f.site.id, receiptNumber: "GRN-TEST-001", purchaseOrderId: new mongoose.Types.ObjectId(), supplierId: new mongoose.Types.ObjectId(), receivedAt: new Date("2026-11-24T10:00:00Z"), items: [{ purchaseOrderItemId: new mongoose.Types.ObjectId(), materialId: f.material.id, batchId: new mongoose.Types.ObjectId(), transactionId: new mongoose.Types.ObjectId(), quantityReceived: mongoose.Types.Decimal128.fromString("200"), unitCost: mongoose.Types.Decimal128.fromString("7.50"), netAmount: mongoose.Types.Decimal128.fromString("1500") }], netTotal: mongoose.Types.Decimal128.fromString("1500"), receivedBy: f.company.user.id, status: "CONFIRMED" });
    expect((await listWastages(f.identity, query)).summary.wastagePercentage).toBe("50.00");
    expect((await listWastages(f.identity, listWastagesSchema.parse({ ...query, reason: "DAMAGE" }))).summary.wastagePercentage).toBe("50.00");
  });
});
