import { afterAll, beforeAll, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { AuditLog } from "@/modules/audit/models/audit-log";
import { Membership, User } from "@/modules/auth/models/identity";
import { login, registerCompany } from "@/modules/auth/services/auth-service";
import { hashPassword } from "@/modules/auth/services/security";
import { InventoryBalance } from "@/modules/inventory/models/inventory-balance";
import { InventoryBatch } from "@/modules/inventory/models/inventory-batch";
import { InventoryTransaction } from "@/modules/inventory/models/inventory-transaction";
import { createAdjustment } from "@/modules/inventory/services/inventory-adjustment-service";
import { createCategory } from "@/modules/materials/services/category-service";
import { createMaterial } from "@/modules/materials/services/material-service";
import { createMaterialSchema } from "@/modules/materials/schemas/catalogue";
import { createPurchaseOrderSchema } from "@/modules/purchasing/schemas/purchase-order";
import { createPurchaseOrder, getPurchaseOrder, transitionPurchaseOrder } from "@/modules/purchasing/services/purchase-order-service";
import { GoodsReceipt } from "@/modules/receiving/models/goods-receipt";
import { createGoodsReceiptSchema, listGoodsReceiptsSchema } from "@/modules/receiving/schemas/goods-receipt";
import { createGoodsReceipt, getGoodsReceipt, listGoodsReceipts, listPurchaseOrderReceipts, reverseGoodsReceipt } from "@/modules/receiving/services/goods-receipt-service";
import { createSite } from "@/modules/sites/services/site-service";
import { createSiteSchema } from "@/modules/sites/schemas/site";
import { createSupplier } from "@/modules/suppliers/services/supplier-service";
import { createSupplierSchema } from "@/modules/suppliers/schemas/supplier";
import { SiteAssignment } from "@/modules/users/models/site-assignment";

let replicaSet: MongoMemoryReplSet;

async function fixture(label: string, email: string) {
  const password = "strong-password-123";
  const company = await registerCompany({ companyName: label, ownerName: "Owner", email, password, currencyCode: "EUR" }, null);
  const identity = (await login({ email, password }, null, null)).identity;
  const site = await createSite(identity, createSiteSchema.parse({ code: "SITE-001", name: "Main Site", location: { city: "Berlin", country: "Germany" }, status: "ACTIVE" }));
  const supplier = await createSupplier(identity, createSupplierSchema.parse({ code: "SUP-001", name: "Acme Materials" }));
  const category = await createCategory(identity, { name: "Materials" });
  const material = await createMaterial(identity, createMaterialSchema.parse({ code: "MAT-001", name: "Cement", categoryId: category.id, unit: "BAG", minimumStockLevel: "0" }));
  const order = await createPurchaseOrder(identity, createPurchaseOrderSchema.parse({ siteId: site.id, supplierId: supplier.id, items: [{ materialId: material.id, quantityOrdered: "10", unitPrice: "7.00", taxRate: "18" }] }));
  await transitionPurchaseOrder(identity, order.id, "submit");
  await transitionPurchaseOrder(identity, order.id, "approve");
  await transitionPurchaseOrder(identity, order.id, "mark-ordered");
  return { company, identity, site, supplier, material, order };
}

function delivery(f: Awaited<ReturnType<typeof fixture>>, quantity: string, overrides: Record<string, unknown> = {}) {
  return createGoodsReceiptSchema.parse({
    purchaseOrderId: f.order.id, receivedAt: "2026-11-24T11:30:00.000Z", deliveryChallanNumber: "DC-100", invoiceNumber: "INV-100",
    items: [{ purchaseOrderItemId: f.order.items[0].id, materialId: f.material.id, quantityReceived: quantity, unitCost: "7.50", supplierBatchNumber: "CEM-ABC" }],
    ...overrides,
  });
}

beforeAll(async () => {
  replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = replicaSet.getUri();
  process.env.MONGODB_DB_NAME = "constructstock_receiving_test";
  process.env.APP_URL = "http://localhost:3000";
  process.env.TOKEN_PEPPER = "test-only-pepper-with-more-than-thirty-two-characters";
});

afterAll(async () => {
  await mongoose.disconnect();
  globalThis.constructStockMongoose = undefined;
  await replicaSet?.stop();
});

describe("goods receiving", () => {
  it("posts partial and final deliveries atomically and replays idempotent requests", async () => {
    const f = await fixture("Receiving Flow", "receiving-flow@example.com");
    const input = delivery(f, "3", { purchaseOrderId: f.order.id.toUpperCase(), items: [{ purchaseOrderItemId: f.order.items[0].id.toUpperCase(), materialId: f.material.id.toUpperCase(), quantityReceived: "3", unitCost: "7.50", supplierBatchNumber: "CEM-ABC" }] });
    const first = await createGoodsReceipt(f.identity, input, "receipt-first-001");
    expect(first).toMatchObject({ status: "CONFIRMED", purchaseOrderStatus: "PARTIALLY_RECEIVED" });
    expect(await createGoodsReceipt(f.identity, input, "receipt-first-001")).toEqual(first);
    await expect(createGoodsReceipt(f.identity, delivery(f, "4"), "receipt-first-001")).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
    expect((await InventoryBalance.findOne({ organizationId: f.company.organization.id, siteId: f.site.id, materialId: f.material.id }))?.onHandQuantity.toString()).toBe("3");
    expect((await InventoryBalance.findOne({ organizationId: f.company.organization.id, siteId: f.site.id, materialId: f.material.id }))?.inventoryValue.toString()).toBe("22.5");
    expect((await getPurchaseOrder(f.identity, f.order.id)).items[0]).toMatchObject({ quantityReceived: "3", remainingQuantity: "7" });
    expect((await getGoodsReceipt(f.identity, first.id)).items[0]).toMatchObject({ quantityReceived: "3", unitCost: "7.50", netAmount: "22.50", supplierBatchNumber: "CEM-ABC" });
    expect((await listPurchaseOrderReceipts(f.identity, f.order.id)).map((receipt) => receipt.id)).toEqual([first.id]);
    expect((await listGoodsReceipts(f.identity, listGoodsReceiptsSchema.parse({ siteId: f.site.id }))).receipts).toHaveLength(1);
    expect((await createGoodsReceipt(f.identity, delivery(f, "7"), "receipt-final-001")).purchaseOrderStatus).toBe("RECEIVED");
    expect((await InventoryBatch.find({ goodsReceiptId: first.id })).length).toBe(1);
    expect(await InventoryTransaction.countDocuments({ referenceType: "GOODS_RECEIPT", type: "RECEIPT" })).toBe(2);
    expect((await InventoryBalance.findOne({ siteId: f.site.id, materialId: f.material.id }))?.onHandQuantity.toString()).toBe("10");
    expect((await AuditLog.find({ entityType: "goods_receipt", action: "goods_receipt.confirmed" })).length).toBe(2);
  });

  it("rejects over-receipts, foreign lines, and tenant or site access violations", async () => {
    const first = await fixture("Receiving First", "receiving-first@example.com");
    const second = await fixture("Receiving Second", "receiving-second@example.com");
    await expect(createGoodsReceipt(first.identity, delivery(first, "11"), "receipt-over-001")).rejects.toMatchObject({ code: "OVER_RECEIPT" });
    await expect(createGoodsReceipt(first.identity, delivery(first, "1", { items: [{ purchaseOrderItemId: first.order.items[0].id, materialId: second.material.id, quantityReceived: "1", unitCost: "7.50" }] }), "receipt-foreign-001")).rejects.toMatchObject({ code: "INVALID_RECEIPT_LINE" });
    await expect(createGoodsReceipt(second.identity, delivery(first, "1"), "receipt-tenant-001")).rejects.toMatchObject({ code: "PURCHASE_ORDER_NOT_FOUND" });
    const staff = await User.create({ name: "Storekeeper", email: "receiving-staff@example.com", passwordHash: await hashPassword("staff-password-123") });
    const organizationId = new mongoose.Types.ObjectId(first.company.organization.id);
    await Membership.create({ organizationId, userId: staff._id, role: "STOREKEEPER", status: "ACTIVE" });
    const staffIdentity = (await login({ email: staff.email, password: "staff-password-123" }, null, null)).identity;
    await expect(createGoodsReceipt(staffIdentity, delivery(first, "1"), "receipt-site-001")).rejects.toMatchObject({ code: "SITE_NOT_FOUND" });
    await SiteAssignment.create({ organizationId, siteId: new mongoose.Types.ObjectId(first.site.id), userId: staff._id, assignedBy: new mongoose.Types.ObjectId(first.company.user.id) });
    const assigned = (await login({ email: staff.email, password: "staff-password-123" }, null, null)).identity;
    const posted = await createGoodsReceipt(assigned, delivery(first, "1"), "receipt-site-002");
    expect((await getGoodsReceipt(assigned, posted.id)).id).toBe(posted.id);
    await expect(reverseGoodsReceipt(assigned, posted.id, "Incorrect delivered batch", "reverse-staff-001")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(getGoodsReceipt(second.identity, posted.id)).rejects.toMatchObject({ code: "GOODS_RECEIPT_NOT_FOUND" });
  });

  it("sums multiple batches for a PO line and reverses untouched stock without erasing history", async () => {
    const f = await fixture("Receiving Reversal", "receiving-reversal@example.com");
    const input = delivery(f, "2", { items: [
      { purchaseOrderItemId: f.order.items[0].id, materialId: f.material.id, quantityReceived: "2", unitCost: "7.50", supplierBatchNumber: "LOT-A" },
      { purchaseOrderItemId: f.order.items[0].id, materialId: f.material.id, quantityReceived: "3", unitCost: "8.00", supplierBatchNumber: "LOT-B" },
    ] });
    const posted = await createGoodsReceipt(f.identity, input, "receipt-multibatch-001");
    expect((await getPurchaseOrder(f.identity, f.order.id)).items[0].quantityReceived).toBe("5");
    expect((await InventoryBatch.find({ goodsReceiptId: posted.id })).length).toBe(2);
    expect((await InventoryBalance.findOne({ siteId: f.site.id, materialId: f.material.id }))?.inventoryValue.toString()).toBe("39");
    const reversed = await reverseGoodsReceipt(f.identity, posted.id, "Incorrect material delivery", "reverse-multibatch-001");
    expect(reversed).toMatchObject({ status: "REVERSED", purchaseOrderStatus: "ORDERED" });
    expect(await reverseGoodsReceipt(f.identity, posted.id, "Incorrect material delivery", "reverse-multibatch-001")).toEqual(reversed);
    expect((await GoodsReceipt.findById(posted.id))?.status).toBe("REVERSED");
    expect((await InventoryBalance.findOne({ siteId: f.site.id, materialId: f.material.id }))?.onHandQuantity.toString()).toBe("0");
    expect(await InventoryBatch.countDocuments({ goodsReceiptId: posted.id, status: "REVERSED" })).toBe(2);
    expect(await InventoryTransaction.countDocuments({ referenceId: posted.id, type: "RECEIPT" })).toBe(2);
    expect(await InventoryTransaction.countDocuments({ referenceId: posted.id, type: "REVERSAL" })).toBe(2);
    expect((await getPurchaseOrder(f.identity, f.order.id)).items[0].quantityReceived).toBe("0");
  });

  it("blocks reversal after its stock has been used", async () => {
    const f = await fixture("Receiving Used Stock", "receiving-used@example.com");
    const posted = await createGoodsReceipt(f.identity, delivery(f, "4"), "receipt-used-001");
    await createAdjustment(f.identity, { siteId: f.site.id, materialId: f.material.id, direction: "OUT", quantity: "1", reasonCode: "PHYSICAL_COUNT_CORRECTION", remarks: "One bag damaged in storage" }, "adjust-used-stock-001");
    await expect(reverseGoodsReceipt(f.identity, posted.id, "Incorrect invoice and material", "reverse-used-001")).rejects.toMatchObject({ code: "RECEIPT_STOCK_CHANGED" });
    expect((await GoodsReceipt.findById(posted.id))?.status).toBe("CONFIRMED");
    expect((await getPurchaseOrder(f.identity, f.order.id)).items[0].quantityReceived).toBe("4");
  });
});
