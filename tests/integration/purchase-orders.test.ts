import { afterAll, beforeAll, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { AuditLog } from "@/modules/audit/models/audit-log";
import { Membership, User } from "@/modules/auth/models/identity";
import { login, registerCompany } from "@/modules/auth/services/auth-service";
import { hashPassword } from "@/modules/auth/services/security";
import { InventoryBalance } from "@/modules/inventory/models/inventory-balance";
import { InventoryTransaction } from "@/modules/inventory/models/inventory-transaction";
import { archiveMaterial, updateMaterial } from "@/modules/materials/services/material-service";
import { createCategory } from "@/modules/materials/services/category-service";
import { createMaterial } from "@/modules/materials/services/material-service";
import { createMaterialSchema } from "@/modules/materials/schemas/catalogue";
import { PurchaseOrder } from "@/modules/purchasing/models/purchase-order";
import { createPurchaseOrderSchema, listPurchaseOrdersSchema, updatePurchaseOrderSchema } from "@/modules/purchasing/schemas/purchase-order";
import { createPurchaseOrder, getPurchaseOrder, listPurchaseOrderActivity, listPurchaseOrders, transitionPurchaseOrder, updatePurchaseOrder } from "@/modules/purchasing/services/purchase-order-service";
import { archiveSite, createSite } from "@/modules/sites/services/site-service";
import { createSiteSchema } from "@/modules/sites/schemas/site";
import { archiveSupplier, createSupplier } from "@/modules/suppliers/services/supplier-service";
import { createSupplierSchema } from "@/modules/suppliers/schemas/supplier";
import { SiteAssignment } from "@/modules/users/models/site-assignment";

let replicaSet: MongoMemoryReplSet;

async function fixture(label: string, email: string) {
  const password = "strong-password-123";
  const company = await registerCompany({ companyName: label, ownerName: "Owner", email, password, currencyCode: "EUR" }, null);
  const identity = (await login({ email, password }, null, null)).identity;
  const site = await createSite(identity, createSiteSchema.parse({ code: "SITE-001", name: "Main Site", location: { city: "Berlin", country: "Germany" }, status: "ACTIVE" }));
  const supplier = await createSupplier(identity, createSupplierSchema.parse({ code: "SUP-001", name: "Acme Materials", paymentTerms: "Net 30" }));
  const category = await createCategory(identity, { name: "Core materials" });
  const material = await createMaterial(identity, createMaterialSchema.parse({ code: "MAT-001", name: "Cement", categoryId: category.id, unit: "BAG", minimumStockLevel: "5" }));
  return { company, identity, site, supplier, material };
}

function orderInput(siteId: string, supplierId: string, materialId: string) {
  return createPurchaseOrderSchema.parse({ siteId, supplierId, expectedDeliveryDate: "2026-12-01", notes: "Deliver in the morning", items: [{ materialId, quantityOrdered: "3", unitPrice: "7.25", taxRate: "18" }] });
}

beforeAll(async () => {
  replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = replicaSet.getUri();
  process.env.MONGODB_DB_NAME = "constructstock_purchase_orders_test";
  process.env.APP_URL = "http://localhost:3000";
  process.env.TOKEN_PEPPER = "test-only-pepper-with-more-than-thirty-two-characters";
});

afterAll(async () => {
  await mongoose.disconnect();
  globalThis.constructStockMongoose = undefined;
  await replicaSet?.stop();
});

describe("tenant-scoped purchase order workflow", () => {
  it("calculates tax and transitions a draft without changing inventory", async () => {
    const company = await fixture("PO Workflow", "po-workflow@example.com");
    const input = orderInput(company.site.id, company.supplier.id, company.material.id);
    const created = await createPurchaseOrder(company.identity, input);
    expect(created).toMatchObject({ status: "DRAFT", subtotal: "21.75", taxTotal: "3.92", grandTotal: "25.67", currencyCode: "EUR" });
    expect(created.items[0]).toMatchObject({ quantityOrdered: "3", quantityReceived: "0", remainingQuantity: "3", unitPrice: "7.25", taxRate: "18.0000", grandTotal: "25.67" });
    expect((await listPurchaseOrders(company.identity, listPurchaseOrdersSchema.parse({ q: created.poNumber }))).purchaseOrders).toHaveLength(1);
    expect((await getPurchaseOrder(company.identity, created.id)).id).toBe(created.id);
    const submitted = await transitionPurchaseOrder(company.identity, created.id, "submit");
    expect(submitted.status).toBe("PENDING_APPROVAL");
    await expect(transitionPurchaseOrder(company.identity, created.id, "submit")).rejects.toMatchObject({ code: "INVALID_PURCHASE_ORDER_STATE" });
    const approved = await transitionPurchaseOrder(company.identity, created.id, "approve", "Budget approved");
    expect(approved.approval.approvalRemarks).toBe("Budget approved");
    expect((await transitionPurchaseOrder(company.identity, created.id, "mark-ordered")).status).toBe("ORDERED");
    expect(await InventoryBalance.countDocuments()).toBe(0);
    expect(await InventoryTransaction.countDocuments()).toBe(0);
    expect((await listPurchaseOrderActivity(company.identity, created.id)).map((event) => event.action)).toEqual([
      "purchase_order.mark_ordered", "purchase_order.approve", "purchase_order.submit", "purchase_order.created",
    ]);
  });

  it("edits drafts and blocks archiving referenced master records", async () => {
    const company = await fixture("PO Archives", "po-archives@example.com");
    const created = await createPurchaseOrder(company.identity, orderInput(company.site.id, company.supplier.id, company.material.id));
    const updated = await updatePurchaseOrder(company.identity, created.id, updatePurchaseOrderSchema.parse({ items: [{ materialId: company.material.id, quantityOrdered: "4", unitPrice: "7.25", taxRate: "18" }], notes: "Revised quantity" }));
    expect(updated.items[0].id).toBe(created.items[0].id);
    expect(updated.grandTotal).toBe("34.22");
    await expect(archiveSupplier(company.identity, company.supplier.id)).rejects.toMatchObject({ code: "SUPPLIER_HAS_OPEN_ORDERS" });
    await expect(archiveMaterial(company.identity, company.material.id)).rejects.toMatchObject({ code: "MATERIAL_HAS_OPEN_WORKFLOW" });
    await expect(updateMaterial(company.identity, company.material.id, { unit: "KG" })).rejects.toMatchObject({ code: "MATERIAL_HAS_OPEN_WORKFLOW" });
    await expect(archiveSite(company.identity, company.site.id)).rejects.toMatchObject({ code: "SITE_HAS_OPEN_ORDERS" });
    await transitionPurchaseOrder(company.identity, created.id, "submit");
    await expect(updatePurchaseOrder(company.identity, created.id, { notes: "Too late" })).rejects.toMatchObject({ code: "INVALID_PURCHASE_ORDER_STATE" });
    expect((await transitionPurchaseOrder(company.identity, created.id, "reject", "Incorrect delivery date")).status).toBe("REJECTED");
    expect((await PurchaseOrder.findById(created.id))?.status).toBe("REJECTED");
    expect((await AuditLog.find({ action: "purchase_order.updated" })).length).toBe(1);
    expect((await archiveSupplier(company.identity, company.supplier.id)).status).toBe("ARCHIVED");
  });

  it("rounds each tax-exclusive line before summing and cancels an ordered PO", async () => {
    const company = await fixture("PO Commercial", "po-commercial@example.com");
    const category = await createCategory(company.identity, { name: "Measured materials" });
    const sand = await createMaterial(company.identity, createMaterialSchema.parse({ code: "MAT-002", name: "Sand", categoryId: category.id, unit: "TON", minimumStockLevel: "0" }));
    const input = createPurchaseOrderSchema.parse({
      ...orderInput(company.site.id, company.supplier.id, company.material.id),
      items: [
        { materialId: company.material.id, quantityOrdered: "3", unitPrice: "7.25", taxRate: "18" },
        { materialId: sand.id, quantityOrdered: "1.125", unitPrice: "28.00", taxRate: "12.3456" },
      ],
    });
    const created = await createPurchaseOrder(company.identity, input);
    expect(created.items[1]).toMatchObject({ quantityOrdered: "1.125", subtotal: "31.50", taxTotal: "3.89", grandTotal: "35.39" });
    expect(created).toMatchObject({ subtotal: "53.25", taxTotal: "7.81", grandTotal: "61.06" });
    await transitionPurchaseOrder(company.identity, created.id, "submit");
    await transitionPurchaseOrder(company.identity, created.id, "approve");
    await transitionPurchaseOrder(company.identity, created.id, "mark-ordered");
    await expect(transitionPurchaseOrder(company.identity, created.id, "cancel", "short")).rejects.toMatchObject({ code: "REASON_REQUIRED" });
    expect((await transitionPurchaseOrder(company.identity, created.id, "cancel", "Delivery no longer required")).status).toBe("CANCELLED");
    await expect(transitionPurchaseOrder(company.identity, created.id, "mark-ordered")).rejects.toMatchObject({ code: "INVALID_PURCHASE_ORDER_STATE" });
    expect((await listPurchaseOrders(company.identity, listPurchaseOrdersSchema.parse({ status: "CANCELLED" }))).purchaseOrders).toHaveLength(1);
    expect(await InventoryTransaction.countDocuments()).toBe(0);
  });

  it("preserves large exact totals and rejects amounts beyond Decimal128 money precision", async () => {
    const company = await fixture("PO Precision", "po-precision@example.com");
    const base = orderInput(company.site.id, company.supplier.id, company.material.id);
    const large = createPurchaseOrderSchema.parse({
      ...base,
      items: [{ materialId: company.material.id, quantityOrdered: "9999999999999999", unitPrice: "9999999999999999", taxRate: "0" }],
    });
    const created = await createPurchaseOrder(company.identity, large);
    expect(created.grandTotal).toBe("99999999999999980000000000000001.00");
    await expect(createPurchaseOrder(company.identity, {
      ...large,
      items: [{ ...large.items[0], taxRate: "100.0000" }],
    })).rejects.toMatchObject({ code: "PURCHASE_ORDER_AMOUNT_TOO_LARGE", status: 422 });
  });

  it("accepts a purchase order without optional delivery details", async () => {
    const company = await fixture("PO Optional Fields", "po-optional@example.com");
    const input = createPurchaseOrderSchema.parse({
      siteId: company.site.id,
      supplierId: company.supplier.id,
      items: [{ materialId: company.material.id, quantityOrdered: "2", unitPrice: "5.00", taxRate: "0" }],
    });
    expect(await createPurchaseOrder(company.identity, input)).toMatchObject({ expectedDeliveryDate: null, notes: null });
  });

  it("enforces company, assigned site, role and unit precision", async () => {
    const first = await fixture("PO First", "po-first@example.com");
    const second = await fixture("PO Second", "po-second@example.com");
    await expect(createPurchaseOrder(first.identity, orderInput(second.site.id, first.supplier.id, first.material.id))).rejects.toMatchObject({ code: "SITE_NOT_FOUND" });
    await expect(createPurchaseOrder(first.identity, orderInput(first.site.id, second.supplier.id, first.material.id))).rejects.toMatchObject({ code: "SUPPLIER_NOT_FOUND" });
    await expect(createPurchaseOrder(first.identity, orderInput(first.site.id, first.supplier.id, second.material.id))).rejects.toMatchObject({ code: "MATERIAL_NOT_FOUND" });
    await expect(createPurchaseOrder(first.identity, createPurchaseOrderSchema.parse({ ...orderInput(first.site.id, first.supplier.id, first.material.id), items: [{ materialId: first.material.id, quantityOrdered: "1.5", unitPrice: "7.25", taxRate: "18" }] }))).rejects.toMatchObject({ code: "INVALID_ORDER_QUANTITY" });
    expect(createPurchaseOrderSchema.safeParse({ ...orderInput(first.site.id, first.supplier.id, first.material.id), items: [{ materialId: first.material.id, quantityOrdered: "1", unitPrice: "7", taxRate: "18" }, { materialId: first.material.id, quantityOrdered: "2", unitPrice: "7", taxRate: "18" }] }).success).toBe(false);
    const created = await createPurchaseOrder(first.identity, orderInput(first.site.id, first.supplier.id, first.material.id));
    await expect(getPurchaseOrder(second.identity, created.id)).rejects.toMatchObject({ code: "PURCHASE_ORDER_NOT_FOUND" });
    const staff = await User.create({ name: "Site Manager", email: "po-staff@example.com", passwordHash: await hashPassword("staff-password-123") });
    const organizationId = new mongoose.Types.ObjectId(first.company.organization.id);
    await Membership.create({ organizationId, userId: staff._id, role: "SITE_MANAGER", status: "ACTIVE" });
    const staffIdentity = (await login({ email: staff.email, password: "staff-password-123" }, null, null)).identity;
    expect((await listPurchaseOrders(staffIdentity, listPurchaseOrdersSchema.parse({}))).purchaseOrders).toEqual([]);
    await expect(createPurchaseOrder(staffIdentity, orderInput(first.site.id, first.supplier.id, first.material.id))).rejects.toMatchObject({ code: "SITE_NOT_FOUND" });
    await SiteAssignment.create({ organizationId, siteId: new mongoose.Types.ObjectId(first.site.id), userId: staff._id, assignedBy: new mongoose.Types.ObjectId(first.company.user.id) });
    const assigned = (await login({ email: staff.email, password: "staff-password-123" }, null, null)).identity;
    expect((await listPurchaseOrders(assigned, listPurchaseOrdersSchema.parse({}))).purchaseOrders).toHaveLength(1);
    const own = await createPurchaseOrder(assigned, orderInput(first.site.id, first.supplier.id, first.material.id));
    expect((await transitionPurchaseOrder(assigned, own.id, "submit")).status).toBe("PENDING_APPROVAL");
    await expect(transitionPurchaseOrder(assigned, own.id, "approve")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(updatePurchaseOrder(assigned, created.id, { notes: "Other person's draft" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
