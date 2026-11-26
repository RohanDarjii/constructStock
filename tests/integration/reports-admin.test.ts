import { afterAll, beforeAll, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { listAuditLogs, getAuditLog } from "@/modules/audit/services/audit-read-service";
import { auditQuerySchema } from "@/modules/audit/schemas/audit";
import { AuditLog } from "@/modules/audit/models/audit-log";
import { Membership, User } from "@/modules/auth/models/identity";
import { login, registerCompany } from "@/modules/auth/services/auth-service";
import { hashPassword } from "@/modules/auth/services/security";
import { createConsumptionSchema } from "@/modules/consumption/schemas/consumption";
import { createConsumption } from "@/modules/consumption/services/consumption-service";
import { FileAttachment } from "@/modules/files/models/file-attachment";
import { createAttachmentSchema } from "@/modules/files/schemas/file-attachment";
import { deleteUnlinkedAttachment, getAttachmentMetadata } from "@/modules/files/services/file-attachment-service";
import { InventoryBalance } from "@/modules/inventory/models/inventory-balance";
import { createCategory } from "@/modules/materials/services/category-service";
import { createMaterial } from "@/modules/materials/services/material-service";
import { createMaterialSchema } from "@/modules/materials/schemas/catalogue";
import { getOrganization, updateOrganization } from "@/modules/organization/services/organization-service";
import { createPurchaseOrderSchema } from "@/modules/purchasing/schemas/purchase-order";
import { createPurchaseOrder, transitionPurchaseOrder } from "@/modules/purchasing/services/purchase-order-service";
import { createGoodsReceiptSchema } from "@/modules/receiving/schemas/goods-receipt";
import { createGoodsReceipt, getGoodsReceipt } from "@/modules/receiving/services/goods-receipt-service";
import { renderReportExport } from "@/modules/reports/services/report-export-service";
import { getReport, getReportOptions } from "@/modules/reports/services/report-service";
import { createSiteSchema } from "@/modules/sites/schemas/site";
import { createSite } from "@/modules/sites/services/site-service";
import { createSupplierSchema } from "@/modules/suppliers/schemas/supplier";
import { createSupplier } from "@/modules/suppliers/services/supplier-service";
import { SiteAssignment } from "@/modules/users/models/site-assignment";
import { createWastageSchema } from "@/modules/wastage/schemas/wastage";
import { createWastage } from "@/modules/wastage/services/wastage-service";

let replicaSet: MongoMemoryReplSet;
const now = () => new Date().toISOString();
const today = () => now().slice(0, 10);

async function fixture(label: string, email: string) {
  const password = "strong-password-123";
  const company = await registerCompany({ companyName: label, ownerName: "Owner", email, password, currencyCode: "EUR" }, null);
  const identity = (await login({ email, password }, null, null)).identity;
  const site = await createSite(identity, createSiteSchema.parse({ code: "SITE-001", name: "Main Site", location: { city: "Berlin", country: "Germany" }, status: "ACTIVE" }));
  const supplier = await createSupplier(identity, createSupplierSchema.parse({ code: "SUP-001", name: "Acme Materials" }));
  const category = await createCategory(identity, { name: "Concrete" });
  const material = await createMaterial(identity, createMaterialSchema.parse({ code: "MAT-001", name: "Cement", categoryId: category.id, unit: "BAG", minimumStockLevel: "0" }));
  return { company, identity, site, supplier, category, material };
}

beforeAll(async () => {
  replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = replicaSet.getUri();
  process.env.MONGODB_DB_NAME = "constructstock_reports_admin_test";
  process.env.APP_URL = "http://localhost:3000";
  process.env.TOKEN_PEPPER = "test-only-pepper-with-more-than-thirty-two-characters";
});
afterAll(async () => { await mongoose.disconnect(); globalThis.constructStockMongoose = undefined; await replicaSet?.stop(); });

describe("attachments, reports, audit, and organization settings", () => {
  it("links private receipt evidence atomically and produces tenant-scoped reports and exports", async () => {
    const f = await fixture("Reporting First", "reporting-first@example.com");
    const other = await fixture("Reporting Other", "reporting-other@example.com");
    const order = await createPurchaseOrder(f.identity, createPurchaseOrderSchema.parse({ siteId: f.site.id, supplierId: f.supplier.id, items: [{ materialId: f.material.id, quantityOrdered: "10", unitPrice: "7.00", taxRate: "18" }] }));
    await transitionPurchaseOrder(f.identity, order.id, "submit");
    await transitionPurchaseOrder(f.identity, order.id, "approve");
    await transitionPurchaseOrder(f.identity, order.id, "mark-ordered");
    const organizationId = new mongoose.Types.ObjectId(f.company.organization.id);
    const attachment = await FileAttachment.create({ organizationId, siteId: new mongoose.Types.ObjectId(f.site.id), linkedEntityType: "GOODS_RECEIPT", purpose: "INVOICE", fileKey: "organizations/test/invoice.pdf", fileName: "invoice.pdf", mimeType: "application/pdf", size: 100, uploadState: "READY", uploadedBy: new mongoose.Types.ObjectId(f.company.user.id), uploadedAt: new Date() });
    const receipt = await createGoodsReceipt(f.identity, createGoodsReceiptSchema.parse({ purchaseOrderId: order.id, receivedAt: now(), attachmentIds: [attachment._id.toString()], items: [{ purchaseOrderItemId: order.items[0].id, materialId: f.material.id, quantityReceived: "4", unitCost: "7.00" }] }), "report-receipt-001");
    expect((await getGoodsReceipt(f.identity, receipt.id)).attachments).toMatchObject([{ id: attachment._id.toString(), purpose: "INVOICE" }]);
    expect((await getAttachmentMetadata(f.identity, attachment._id.toString())).contentPath).toBe(`/api/v1/files/${attachment._id}/content`);
    await expect(getAttachmentMetadata(other.identity, attachment._id.toString())).rejects.toMatchObject({ code: "FILE_NOT_FOUND" });
    await expect(deleteUnlinkedAttachment(f.identity, attachment._id.toString())).rejects.toMatchObject({ code: "FILE_NOT_FOUND" });
    expect(createAttachmentSchema.safeParse({ siteId: f.site.id, fileName: "invoice.pdf", purpose: "INVOICE", mimeType: "application/pdf", size: 100 }).success).toBe(true);
    expect(createAttachmentSchema.safeParse({ siteId: f.site.id, fileName: "evidence.pdf", purpose: "WASTAGE_PHOTO", mimeType: "application/pdf", size: 100 }).success).toBe(false);

    await createConsumption(f.identity, createConsumptionSchema.parse({ siteId: f.site.id, materialId: f.material.id, quantity: "1", issuedAt: now(), activity: "Foundation pour", issuedTo: "Crew A", allocationMethod: "FIFO" }), "report-consumption-001");
    await createWastage(f.identity, createWastageSchema.parse({ siteId: f.site.id, materialId: f.material.id, quantity: "1", wastedAt: now(), reason: "BREAKAGE", allocationMethod: "FIFO" }), "report-wastage-001");
    const foreignFile = await FileAttachment.create({ organizationId: new mongoose.Types.ObjectId(other.company.organization.id), siteId: new mongoose.Types.ObjectId(other.site.id), linkedEntityType: "GOODS_RECEIPT", purpose: "INVOICE", fileKey: "organizations/other/invoice.pdf", fileName: "invoice.pdf", mimeType: "application/pdf", size: 100, uploadState: "READY", uploadedBy: new mongoose.Types.ObjectId(other.company.user.id), uploadedAt: new Date() });
    await expect(createGoodsReceipt(f.identity, createGoodsReceiptSchema.parse({ purchaseOrderId: order.id, receivedAt: now(), attachmentIds: [foreignFile._id.toString()], items: [{ purchaseOrderItemId: order.items[0].id, materialId: f.material.id, quantityReceived: "1", unitCost: "7.00" }] }), "report-foreign-file-001")).rejects.toMatchObject({ code: "FILE_NOT_READY" });
    expect((await InventoryBalance.findOne({ organizationId, siteId: new mongoose.Types.ObjectId(f.site.id) }))?.onHandQuantity.toString()).toBe("2");

    const inventory = await getReport(f.identity, "inventory", {});
    expect(inventory.summary).toContainEqual({ label: "Inventory value", value: "EUR 14.00" });
    expect(inventory.rows).toHaveLength(1);
    const purchases = await getReport(f.identity, "purchases", { from: today(), to: today() });
    expect(purchases.rows).toHaveLength(1);
    const suppliers = await getReport(f.identity, "suppliers", { from: today(), to: today() });
    expect(suppliers.rows[0][1]).toBe("1");
    const consumption = await getReport(f.identity, "consumption", { from: today(), to: today() });
    expect(consumption.summary).toContainEqual({ label: "Issued value", value: "EUR 7.00" });
    const wastage = await getReport(f.identity, "wastage", { from: today(), to: today(), categoryId: f.category.id });
    expect(wastage.summary).toContainEqual({ label: "Loss / receipts", value: "25.00%" });
    const site = await getReport(f.identity, "sites", { siteId: f.site.id, from: today(), to: today() });
    expect(site.rows).toHaveLength(3);
    const pdf = await renderReportExport(inventory, "pdf");
    const xlsx = await renderReportExport(inventory, "xlsx");
    expect(Buffer.from(pdf.bytes).subarray(0, 4).toString()).toBe("%PDF");
    expect(Buffer.from(xlsx.bytes).subarray(0, 2).toString()).toBe("PK");
    expect((await getReport(other.identity, "inventory", {})).rows).toEqual([]);
    await expect(getReport(f.identity, "sites", { siteId: other.site.id })).rejects.toMatchObject({ code: "SITE_NOT_FOUND" });
    expect((await getReportOptions(f.identity)).sites.map((entry) => entry.id)).toContain(f.site.id);
  });

  it("restricts reports and audit history, and audits organization changes", async () => {
    const f = await fixture("Admin First", "admin-first@example.com");
    const other = await fixture("Admin Other", "admin-other@example.com");
    const before = await getOrganization(f.identity);
    expect(before.name).toBe("Admin First");
    const updated = await updateOrganization(f.identity, { name: "Admin First Revised" });
    expect(updated.name).toBe("Admin First Revised");
    const audit = await listAuditLogs(f.identity, auditQuerySchema.parse({ action: "organization.updated" }));
    expect(audit.auditLogs).toHaveLength(1);
    expect((await getAuditLog(f.identity, audit.auditLogs[0].id)).entityId).toBe(f.company.organization.id);
    const otherLog = await AuditLog.findOne({ organizationId: other.company.organization.id });
    await expect(getAuditLog(f.identity, otherLog!._id.toString())).rejects.toMatchObject({ code: "AUDIT_NOT_FOUND" });

    const worker = await User.create({ name: "Storekeeper", email: "reports-worker@example.com", passwordHash: await hashPassword("staff-password-123") });
    const organizationId = new mongoose.Types.ObjectId(f.company.organization.id);
    await Membership.create({ organizationId, userId: worker._id, role: "STOREKEEPER", status: "ACTIVE" });
    await SiteAssignment.create({ organizationId, siteId: new mongoose.Types.ObjectId(f.site.id), userId: worker._id, assignedBy: new mongoose.Types.ObjectId(f.company.user.id) });
    const staff = (await login({ email: worker.email, password: "staff-password-123" }, null, null)).identity;
    await expect(getReport(staff, "inventory", {})).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(listAuditLogs(staff, auditQuerySchema.parse({}))).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(updateOrganization(staff, { name: "Not Allowed" })).rejects.toMatchObject({ code: "FORBIDDEN" });

    const hiddenSite = await createSite(f.identity, createSiteSchema.parse({ code: "SITE-002", name: "Private Site", location: { city: "Hamburg", country: "Germany" }, status: "ACTIVE" }));
    const manager = await User.create({ name: "Site Manager", email: "reports-manager@example.com", passwordHash: await hashPassword("staff-password-123") });
    await Membership.create({ organizationId, userId: manager._id, role: "SITE_MANAGER", status: "ACTIVE" });
    await SiteAssignment.create({ organizationId, siteId: new mongoose.Types.ObjectId(f.site.id), userId: manager._id, assignedBy: new mongoose.Types.ObjectId(f.company.user.id) });
    const managerIdentity = (await login({ email: manager.email, password: "staff-password-123" }, null, null)).identity;
    expect((await getReportOptions(managerIdentity)).sites.map((site) => site.id)).toEqual([f.site.id]);
    await expect(getReport(managerIdentity, "sites", { siteId: hiddenSite.id })).rejects.toMatchObject({ code: "SITE_NOT_FOUND" });
    expect((await getReport(managerIdentity, "sites", { siteId: f.site.id })).kind).toBe("sites");
  });
});
