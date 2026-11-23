import { afterAll, beforeAll, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { AuditLog } from "@/modules/audit/models/audit-log";
import { Membership, User } from "@/modules/auth/models/identity";
import { login, registerCompany } from "@/modules/auth/services/auth-service";
import { hashPassword } from "@/modules/auth/services/security";
import { Supplier } from "@/modules/suppliers/models/supplier";
import { createSupplierSchema, listSuppliersQuerySchema, updateSupplierSchema } from "@/modules/suppliers/schemas/supplier";
import { archiveSupplier, createSupplier, getSupplier, listSuppliers, restoreSupplier, updateSupplier } from "@/modules/suppliers/services/supplier-service";

let replicaSet: MongoMemoryReplSet;

async function owner(companyName: string, email: string) {
  const password = "strong-password-123";
  const registered = await registerCompany({ companyName, ownerName: "Owner", email, password, currencyCode: "EUR" }, null);
  const signedIn = await login({ email, password }, null, null);
  return { registered, identity: signedIn.identity };
}

beforeAll(async () => {
  replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = replicaSet.getUri();
  process.env.MONGODB_DB_NAME = "constructstock_suppliers_test";
  process.env.APP_URL = "http://localhost:3000";
  process.env.TOKEN_PEPPER = "test-only-pepper-with-more-than-thirty-two-characters";
});

afterAll(async () => {
  await mongoose.disconnect();
  globalThis.constructStockMongoose = undefined;
  await replicaSet?.stop();
});

describe("tenant-scoped supplier management", () => {
  it("creates, searches and updates suppliers only within the active organization", async () => {
    const first = await owner("First Supplier Company", "supplier-first@example.com");
    const second = await owner("Second Supplier Company", "supplier-second@example.com");
    const input = createSupplierSchema.parse({ code: "sup-001", name: "Acme Cement", contactPerson: "Jane Smith", email: "JANE@EXAMPLE.COM", address: { line1: "10 Main Street", city: "Berlin", state: "Berlin", postalCode: "10115", country: "Germany" }, paymentTerms: "Net 30" });
    const supplier = await createSupplier(first.identity, input);
    const other = await createSupplier(second.identity, input);
    expect(supplier.code).toBe("SUP-001");
    expect(supplier.email).toBe("jane@example.com");
    expect(supplier.address?.city).toBe("Berlin");
    expect(other.id).not.toBe(supplier.id);
    await expect(createSupplier(first.identity, input)).rejects.toMatchObject({ code: "SUPPLIER_CODE_EXISTS", status: 409 });
    await expect(getSupplier(first.identity, other.id)).rejects.toMatchObject({ code: "SUPPLIER_NOT_FOUND" });
    await expect(updateSupplier(first.identity, other.id, { name: "Wrong Tenant" })).rejects.toMatchObject({ code: "SUPPLIER_NOT_FOUND" });
    expect((await listSuppliers(first.identity, listSuppliersQuerySchema.parse({ q: "Acme" }))).suppliers.map((item) => item.id)).toEqual([supplier.id]);
    expect((await listSuppliers(first.identity, listSuppliersQuerySchema.parse({ q: "Ac.e" }))).suppliers).toEqual([]);
    const updated = await updateSupplier(first.identity, supplier.id, updateSupplierSchema.parse({ name: "Acme Supplies", paymentTerms: null, address: null }));
    expect(updated.name).toBe("Acme Supplies");
    expect(updated.address).toBeNull();
    expect(updated.paymentTerms).toBeNull();
    const audit = await AuditLog.find({ organizationId: new mongoose.Types.ObjectId(first.registered.organization.id), entityType: "supplier", entityId: supplier.id }).sort({ createdAt: 1 });
    expect(audit.map((entry) => entry.action)).toEqual(["supplier.created", "supplier.updated"]);
  });

  it("archives and restores suppliers while preserving history and codes", async () => {
    const company = await owner("Archive Supplier Company", "supplier-archive@example.com");
    const supplier = await createSupplier(company.identity, createSupplierSchema.parse({ code: "SUP-AR", name: "Archive Me" }));
    const organizationId = new mongoose.Types.ObjectId(company.registered.organization.id);
    const supplierId = new mongoose.Types.ObjectId(supplier.id);
    const db = mongoose.connection.db!;
    const order = await db.collection("purchase_orders").insertOne({ organizationId, supplierId, status: "ORDERED" });
    await expect(archiveSupplier(company.identity, supplier.id)).rejects.toMatchObject({ code: "SUPPLIER_HAS_OPEN_ORDERS", status: 409 });
    expect((await Supplier.findById(supplier.id))?.status).toBe("ACTIVE");
    await db.collection("purchase_orders").updateOne({ _id: order.insertedId }, { $set: { status: "RECEIVED" } });
    await db.collection("purchase_orders").insertOne({ organizationId: new mongoose.Types.ObjectId(), supplierId, status: "ORDERED" });
    expect((await archiveSupplier(company.identity, supplier.id)).status).toBe("ARCHIVED");
    expect((await listSuppliers(company.identity, listSuppliersQuerySchema.parse({}))).suppliers).toEqual([]);
    expect((await listSuppliers(company.identity, listSuppliersQuerySchema.parse({ status: "ARCHIVED" }))).suppliers.map((item) => item.id)).toEqual([supplier.id]);
    await expect(updateSupplier(company.identity, supplier.id, { name: "Edit Archived" })).rejects.toMatchObject({ code: "SUPPLIER_ARCHIVED" });
    await expect(createSupplier(company.identity, createSupplierSchema.parse({ code: "SUP-AR", name: "Reuse Code" }))).rejects.toMatchObject({ code: "SUPPLIER_CODE_EXISTS" });
    expect((await restoreSupplier(company.identity, supplier.id)).status).toBe("ACTIVE");
    expect((await Supplier.findById(supplier.id))?.deletedAt).toBeNull();
    const audit = await AuditLog.find({ organizationId, entityType: "supplier", entityId: supplier.id, action: { $in: ["supplier.archived", "supplier.restored"] } });
    expect(audit).toHaveLength(2);
  });

  it("allows staff to read but not manage suppliers", async () => {
    const company = await owner("Staff Supplier Company", "supplier-owner@example.com");
    const supplier = await createSupplier(company.identity, createSupplierSchema.parse({ code: "STAFF-01", name: "Readable Vendor" }));
    const organizationId = new mongoose.Types.ObjectId(company.registered.organization.id);
    const staff = await User.create({ name: "Storekeeper", email: "supplier-staff@example.com", passwordHash: await hashPassword("strong-password-456") });
    await Membership.create({ organizationId, userId: staff._id, role: "STOREKEEPER", status: "ACTIVE" });
    const identity = (await login({ email: staff.email, password: "strong-password-456" }, null, null)).identity;
    expect((await getSupplier(identity, supplier.id)).id).toBe(supplier.id);
    await expect(createSupplier(identity, createSupplierSchema.parse({ code: "STAFF-02", name: "No Permission" }))).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(updateSupplier(identity, supplier.id, { name: "No Permission" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(archiveSupplier(identity, supplier.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects malformed contact, address and update payloads", () => {
    expect(createSupplierSchema.safeParse({ code: "!", name: "A" }).success).toBe(false);
    expect(createSupplierSchema.safeParse({ code: "SUP-01", name: "Vendor", email: "not-an-email" }).success).toBe(false);
    expect(createSupplierSchema.safeParse({ code: "SUP-01", name: "Vendor", address: { line1: "10 Main Street" } }).success).toBe(false);
    expect(updateSupplierSchema.safeParse({}).success).toBe(false);
    expect(updateSupplierSchema.safeParse({ code: "NEW-CODE" }).success).toBe(false);
  });
});
