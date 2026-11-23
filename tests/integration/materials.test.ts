import { afterAll, beforeAll, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { AuditLog } from "@/modules/audit/models/audit-log";
import { Membership, User } from "@/modules/auth/models/identity";
import { login, registerCompany } from "@/modules/auth/services/auth-service";
import { hashPassword } from "@/modules/auth/services/security";
import { Material } from "@/modules/materials/models/material";
import { createCategorySchema, createMaterialSchema, listMaterialsQuerySchema, updateMaterialSchema } from "@/modules/materials/schemas/catalogue";
import { archiveCategory, createCategory, listCategories, updateCategory } from "@/modules/materials/services/category-service";
import { archiveMaterial, createMaterial, getMaterial, listMaterials, restoreMaterial, updateMaterial } from "@/modules/materials/services/material-service";

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
  process.env.MONGODB_DB_NAME = "constructstock_materials_test";
  process.env.APP_URL = "http://localhost:3000";
  process.env.TOKEN_PEPPER = "test-only-pepper-with-more-than-thirty-two-characters";
});

afterAll(async () => {
  await mongoose.disconnect();
  globalThis.constructStockMongoose = undefined;
  await replicaSet?.stop();
});

describe("tenant-scoped material catalogue", () => {
  it("keeps categories and material codes within their company and audits changes", async () => {
    const first = await owner("First Materials Company", "materials-first@example.com");
    const second = await owner("Second Materials Company", "materials-second@example.com");
    const firstCategory = await createCategory(first.identity, createCategorySchema.parse({ name: "Cement" }));
    const secondCategory = await createCategory(second.identity, createCategorySchema.parse({ name: "Cement" }));
    await expect(createCategory(first.identity, createCategorySchema.parse({ name: "cement" }))).rejects.toMatchObject({ code: "CATEGORY_EXISTS" });
    const input = createMaterialSchema.parse({ code: "CEM-001", name: "OPC Cement", categoryId: firstCategory.id, unit: "BAG", minimumStockLevel: "100", defaultReorderQuantity: "300" });
    const firstMaterial = await createMaterial(first.identity, input);
    const secondMaterial = await createMaterial(second.identity, createMaterialSchema.parse({ ...input, categoryId: secondCategory.id }));
    expect(firstMaterial.id).not.toBe(secondMaterial.id);
    await expect(createMaterial(first.identity, input)).rejects.toMatchObject({ code: "MATERIAL_CODE_EXISTS" });
    await expect(createMaterial(first.identity, createMaterialSchema.parse({ ...input, code: "CEM-002", categoryId: secondCategory.id }))).rejects.toMatchObject({ code: "CATEGORY_NOT_ACTIVE" });
    await expect(getMaterial(first.identity, secondMaterial.id)).rejects.toMatchObject({ code: "MATERIAL_NOT_FOUND" });
    expect((await listMaterials(first.identity, listMaterialsQuerySchema.parse({}))).materials.map((material) => material.id)).toEqual([firstMaterial.id]);
    expect((await listCategories(first.identity, { includeArchived: "false" })).map((category) => category.id)).toEqual([firstCategory.id]);
    const renamed = await updateCategory(first.identity, firstCategory.id, { name: "Concrete" });
    expect((await getMaterial(first.identity, firstMaterial.id)).category.name).toBe(renamed.name);
    const audit = await AuditLog.find({ organizationId: new mongoose.Types.ObjectId(first.registered.organization.id), entityType: "material", entityId: firstMaterial.id });
    expect(audit.map((event) => event.action)).toEqual(["material.created"]);
  });

  it("validates unit precision and keeps the unit fixed after stock history begins", async () => {
    const company = await owner("Unit Company", "materials-units@example.com");
    const category = await createCategory(company.identity, { name: "Aggregate" });
    expect(createMaterialSchema.safeParse({ code: "AGG-001", name: "Aggregate", categoryId: category.id, unit: "BAG", minimumStockLevel: "1.5" }).success).toBe(false);
    expect(createMaterialSchema.safeParse({ code: "AGG-001", name: "Aggregate", categoryId: category.id, unit: "KG", minimumStockLevel: "1.2345" }).success).toBe(false);
    expect(createMaterialSchema.safeParse({ code: "AGG-001", name: "Aggregate", categoryId: category.id, unit: "KG", minimumStockLevel: "0", defaultReorderQuantity: "0" }).success).toBe(false);
    const material = await createMaterial(company.identity, createMaterialSchema.parse({ code: "AGG-001", name: "A.B Aggregate", categoryId: category.id, unit: "KG", minimumStockLevel: "1.234" }));
    expect((await Material.findById(material.id))?.minimumStockLevel).toBeInstanceOf(mongoose.Types.Decimal128);
    await expect(updateMaterial(company.identity, material.id, updateMaterialSchema.parse({ unit: "BAG" }))).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    const changed = await updateMaterial(company.identity, material.id, updateMaterialSchema.parse({ unit: "TON", minimumStockLevel: "1.234" }));
    expect(changed.unit).toBe("TON");
    await Material.updateOne({ _id: material.id }, { $set: { unitLockedAt: new Date() } });
    await expect(updateMaterial(company.identity, material.id, updateMaterialSchema.parse({ unit: "KG" }))).rejects.toMatchObject({ code: "MATERIAL_UNIT_LOCKED" });
    expect((await listMaterials(company.identity, listMaterialsQuerySchema.parse({ q: "A.B" }))).materials.map((item) => item.id)).toEqual([material.id]);
    expect((await listMaterials(company.identity, listMaterialsQuerySchema.parse({ q: "AxB" }))).materials).toEqual([]);
  });

  it("archives materials and prevents archiving a category with referenced materials", async () => {
    const company = await owner("Archive Company", "materials-archive@example.com");
    const category = await createCategory(company.identity, { name: "Steel" });
    const material = await createMaterial(company.identity, createMaterialSchema.parse({ code: "STEEL-01", name: "Steel Bar", categoryId: category.id, unit: "PIECE", minimumStockLevel: "10" }));
    await expect(archiveCategory(company.identity, category.id)).rejects.toMatchObject({ code: "CATEGORY_HAS_MATERIALS" });
    expect((await archiveMaterial(company.identity, material.id)).status).toBe("ARCHIVED");
    expect((await listMaterials(company.identity, listMaterialsQuerySchema.parse({}))).materials).toEqual([]);
    expect((await listMaterials(company.identity, listMaterialsQuerySchema.parse({ status: "ARCHIVED" }))).materials.map((item) => item.id)).toEqual([material.id]);
    await expect(updateMaterial(company.identity, material.id, updateMaterialSchema.parse({ name: "New" }))).rejects.toMatchObject({ code: "MATERIAL_ARCHIVED" });
    await expect(archiveCategory(company.identity, category.id)).rejects.toMatchObject({ code: "CATEGORY_HAS_MATERIALS" });
    expect((await restoreMaterial(company.identity, material.id)).status).toBe("ACTIVE");
    expect((await Material.findById(material.id))?.deletedAt).toBeNull();
    const emptyCategory = await createCategory(company.identity, { name: "Unused" });
    expect((await archiveCategory(company.identity, emptyCategory.id)).status).toBe("ARCHIVED");
  });

  it("blocks archival while a site holds stock or a reserved batch", async () => {
    const company = await owner("Stock Guard Company", "materials-stock-guard@example.com");
    const category = await createCategory(company.identity, { name: "Blocks" });
    const material = await createMaterial(company.identity, createMaterialSchema.parse({ code: "BLK-01", name: "Concrete Block", categoryId: category.id, unit: "PIECE", minimumStockLevel: "0" }));
    const db = mongoose.connection.db!;
    const organizationId = new mongoose.Types.ObjectId(company.registered.organization.id);
    const materialId = new mongoose.Types.ObjectId(material.id);
    const siteId = new mongoose.Types.ObjectId();
    const zero = mongoose.Types.Decimal128.fromString("0");
    const five = mongoose.Types.Decimal128.fromString("5");
    const balance = await db.collection("inventory_balances").insertOne({ organizationId, materialId, siteId, onHandQuantity: five, reservedQuantity: zero });
    await expect(archiveMaterial(company.identity, material.id)).rejects.toMatchObject({ code: "MATERIAL_HAS_ACTIVE_STOCK", status: 409 });
    await db.collection("inventory_balances").updateOne({ _id: balance.insertedId }, { $set: { onHandQuantity: zero } });
    const batch = await db.collection("inventory_batches").insertOne({ organizationId, materialId, siteId, remainingQuantity: zero, reservedQuantity: five });
    await expect(archiveMaterial(company.identity, material.id)).rejects.toMatchObject({ code: "MATERIAL_HAS_ACTIVE_STOCK", status: 409 });
    expect((await Material.findById(material.id))?.status).toBe("ACTIVE");
    await db.collection("inventory_batches").deleteOne({ _id: batch.insertedId });
    expect((await archiveMaterial(company.identity, material.id)).status).toBe("ARCHIVED");
  });

  it("blocks archival for open purchase orders and transfers in the active tenant", async () => {
    const company = await owner("Workflow Guard Company", "materials-workflow-guard@example.com");
    const category = await createCategory(company.identity, { name: "Pipes" });
    const material = await createMaterial(company.identity, createMaterialSchema.parse({ code: "PIPE-01", name: "Drain Pipe", categoryId: category.id, unit: "METER", minimumStockLevel: "0" }));
    const db = mongoose.connection.db!;
    const organizationId = new mongoose.Types.ObjectId(company.registered.organization.id);
    const materialId = new mongoose.Types.ObjectId(material.id);
    const order = await db.collection("purchase_orders").insertOne({ organizationId, status: "ORDERED", items: [{ materialId }] });
    await expect(archiveMaterial(company.identity, material.id)).rejects.toMatchObject({ code: "MATERIAL_HAS_OPEN_WORKFLOW", status: 409 });
    await db.collection("purchase_orders").updateOne({ _id: order.insertedId }, { $set: { status: "RECEIVED" } });
    const transfer = await db.collection("transfers").insertOne({ organizationId, materialId, status: "DISPATCHED" });
    await expect(archiveMaterial(company.identity, material.id)).rejects.toMatchObject({ code: "MATERIAL_HAS_OPEN_WORKFLOW", status: 409 });
    await db.collection("transfers").updateOne({ _id: transfer.insertedId }, { $set: { status: "RECEIVED" } });
    await db.collection("purchase_orders").insertOne({ organizationId: new mongoose.Types.ObjectId(), status: "ORDERED", items: [{ materialId }] });
    expect((await archiveMaterial(company.identity, material.id)).status).toBe("ARCHIVED");
    const audit = await AuditLog.find({ organizationId, entityType: "material", entityId: material.id, action: "material.archived" });
    expect(audit).toHaveLength(1);
  });

  it("allows staff to read the catalogue but not change it", async () => {
    const company = await owner("Staff Company", "materials-owner@example.com");
    const category = await createCategory(company.identity, { name: "Paint" });
    const organizationId = new mongoose.Types.ObjectId(company.registered.organization.id);
    const staff = await User.create({ name: "Storekeeper", email: "materials-staff@example.com", passwordHash: await hashPassword("strong-password-456") });
    await Membership.create({ organizationId, userId: staff._id, role: "STOREKEEPER", status: "ACTIVE" });
    const identity = (await login({ email: staff.email, password: "strong-password-456" }, null, null)).identity;
    expect((await listCategories(identity, { includeArchived: "false" })).map((item) => item.id)).toEqual([category.id]);
    await expect(createCategory(identity, { name: "Other" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createMaterial(identity, createMaterialSchema.parse({ code: "PNT-01", name: "Paint", categoryId: category.id, unit: "LITRE", minimumStockLevel: "1" }))).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
