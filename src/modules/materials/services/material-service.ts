import "server-only";
import mongoose from "mongoose";
import { ensureAuditReady, recordAudit } from "@/modules/audit/services/record-audit";
import type { CurrentIdentity } from "@/modules/auth/services/auth-service";
import { isDuplicateKey } from "@/modules/auth/services/security";
import { hasMaterialStock } from "@/modules/inventory/services/material-archive-guard";
import { hasOpenPurchaseOrderForMaterial } from "@/modules/purchasing/services/material-archive-guard";
import { hasOpenTransferForMaterial } from "@/modules/transfers/services/material-archive-guard";
import { requirePermission } from "@/server/auth/authorize";
import { connectToDatabase } from "@/server/db/connect";
import { AppError } from "@/shared/errors/app-error";
import { Material } from "../models/material";
import { ensureCatalogueReady, findCategoriesByIds, findCategory, findMaterial, listMaterialDocuments, lockActiveCategory, type CategoryDocument, type MaterialDocument } from "../repositories/catalogue-repository";
import { quantityFitsUnit, type CreateMaterialInput, type ListMaterialsQuery, type UpdateMaterialInput } from "../schemas/catalogue";
import type { MaterialUnit, MaterialView } from "../types";

function objectId(value: string): mongoose.Types.ObjectId {
  if (!/^[a-fA-F0-9]{24}$/.test(value)) throw new AppError("MATERIAL_NOT_FOUND", "Material not found.", 404);
  return new mongoose.Types.ObjectId(value);
}

function decimal(value: string): mongoose.Types.Decimal128 { return mongoose.Types.Decimal128.fromString(value); }

function view(material: MaterialDocument, category: CategoryDocument): MaterialView {
  return {
    id: material._id.toString(), code: material.code, name: material.name, description: material.description ?? null,
    category: { id: category._id.toString(), name: category.name }, unit: material.unit as MaterialUnit,
    minimumStockLevel: material.minimumStockLevel.toString(), defaultReorderQuantity: material.defaultReorderQuantity?.toString() ?? null,
    status: material.status as MaterialView["status"], unitLocked: Boolean(material.unitLockedAt),
    createdAt: material.createdAt.toISOString(), updatedAt: material.updatedAt.toISOString(),
  };
}

function mutationError(error: unknown): never {
  if (isDuplicateKey(error)) throw new AppError("MATERIAL_CODE_EXISTS", "A material with this code already exists in your company.", 409);
  if (error instanceof Error && error.name === "VersionError") throw new AppError("MATERIAL_CHANGED", "This material changed. Reload and try again.", 409);
  throw error;
}

function checkQuantity(value: string, unit: MaterialUnit, positive: boolean, field: string): void {
  if (!quantityFitsUnit(value, unit, positive)) {
    throw new AppError("VALIDATION_ERROR", "Check the material quantities for the selected unit.", 422, { fields: { [field]: ["Quantity must match the selected unit."] } });
  }
}

export async function listMaterials(identity: CurrentIdentity, query: ListMaterialsQuery) {
  await connectToDatabase();
  const organizationId = objectId(identity.context.organizationId);
  const documents = await listMaterialDocuments({
    organizationId, status: query.status, categoryId: query.categoryId ? objectId(query.categoryId) : undefined,
    q: query.q, cursor: query.cursor ? objectId(query.cursor) : undefined, limit: query.limit,
  });
  const hasMore = documents.length > query.limit;
  const page = documents.slice(0, query.limit);
  const categories = await findCategoriesByIds(organizationId, page.map((material) => material.categoryId));
  const byId = new Map(categories.map((category) => [category._id.toString(), category]));
  return {
    materials: page.map((material) => {
      const category = byId.get(material.categoryId.toString());
      if (!category) throw new AppError("MATERIAL_CATEGORY_MISSING", "Material category is missing.", 500);
      return view(material, category);
    }),
    pagination: { nextCursor: hasMore ? page.at(-1)?._id.toString() ?? null : null, hasMore, limit: query.limit },
  };
}

export async function getMaterial(identity: CurrentIdentity, materialId: string): Promise<MaterialView> {
  await connectToDatabase();
  const organizationId = objectId(identity.context.organizationId);
  const material = await findMaterial(organizationId, objectId(materialId));
  if (!material) throw new AppError("MATERIAL_NOT_FOUND", "Material not found.", 404);
  const category = await findCategory(organizationId, material.categoryId);
  if (!category) throw new AppError("MATERIAL_CATEGORY_MISSING", "Material category is missing.", 500);
  return view(material, category);
}

export async function createMaterial(identity: CurrentIdentity, input: CreateMaterialInput): Promise<MaterialView> {
  requirePermission(identity, "material.manage");
  await connectToDatabase();
  await Promise.all([ensureCatalogueReady(), ensureAuditReady()]);
  const organizationId = objectId(identity.context.organizationId);
  const actorUserId = objectId(identity.context.userId);
  try {
    const result = await mongoose.connection.transaction(async (session) => {
      const categoryId = objectId(input.categoryId);
      if (!await lockActiveCategory(organizationId, categoryId, session)) throw new AppError("CATEGORY_NOT_ACTIVE", "Choose an active category in your company.", 422);
      const category = await findCategory(organizationId, categoryId, session);
      if (!category) throw new AppError("CATEGORY_NOT_ACTIVE", "Choose an active category in your company.", 422);
      const [material] = await Material.create([{
        organizationId, code: input.code, name: input.name, description: input.description ?? null, categoryId,
        unit: input.unit, minimumStockLevel: decimal(input.minimumStockLevel),
        defaultReorderQuantity: input.defaultReorderQuantity == null ? null : decimal(input.defaultReorderQuantity), createdBy: actorUserId,
      }], { session });
      await recordAudit({ organizationId, actorUserId, action: "material.created", entityType: "material", entityId: material._id.toString() }, session);
      return { material, category };
    });
    return view(result.material, result.category);
  } catch (error) { return mutationError(error); }
}

export async function updateMaterial(identity: CurrentIdentity, materialId: string, input: UpdateMaterialInput): Promise<MaterialView> {
  requirePermission(identity, "material.manage");
  await connectToDatabase();
  await ensureAuditReady();
  const organizationId = objectId(identity.context.organizationId);
  const actorUserId = objectId(identity.context.userId);
  try {
    const result = await mongoose.connection.transaction(async (session) => {
      const material = await findMaterial(organizationId, objectId(materialId), session);
      if (!material) throw new AppError("MATERIAL_NOT_FOUND", "Material not found.", 404);
      if (material.status === "ARCHIVED") throw new AppError("MATERIAL_ARCHIVED", "Restore this material before editing it.", 409);
      const unit = (input.unit ?? material.unit) as MaterialUnit;
      if (input.unit && input.unit !== material.unit && material.unitLockedAt) throw new AppError("MATERIAL_UNIT_LOCKED", "The unit cannot change after the first inventory transaction.", 409);
      if (input.unit && input.unit !== material.unit && await hasOpenPurchaseOrderForMaterial(organizationId, material._id, session)) {
        throw new AppError("MATERIAL_HAS_OPEN_WORKFLOW", "The unit cannot change while an open purchase order references this material.", 409);
      }
      const minimum = input.minimumStockLevel ?? material.minimumStockLevel.toString();
      const reorder = input.defaultReorderQuantity === undefined ? material.defaultReorderQuantity?.toString() ?? null : input.defaultReorderQuantity;
      checkQuantity(minimum, unit, false, "minimumStockLevel");
      if (reorder !== null) checkQuantity(reorder, unit, true, "defaultReorderQuantity");
      const categoryId = input.categoryId ? objectId(input.categoryId) : material.categoryId;
      if (input.categoryId && input.categoryId.toLowerCase() !== material.categoryId.toString()) {
        if (!await lockActiveCategory(organizationId, categoryId, session)) throw new AppError("CATEGORY_NOT_ACTIVE", "Choose an active category in your company.", 422);
      }
      const category = await findCategory(organizationId, categoryId, session);
      if (!category || category.status !== "ACTIVE") throw new AppError("CATEGORY_NOT_ACTIVE", "Choose an active category in your company.", 422);
      if (input.code !== undefined) material.code = input.code;
      if (input.name !== undefined) material.name = input.name;
      if (input.description !== undefined) material.description = input.description;
      material.categoryId = categoryId;
      material.unit = unit;
      material.minimumStockLevel = decimal(minimum);
      material.defaultReorderQuantity = reorder === null ? null : decimal(reorder);
      await material.save({ session });
      await recordAudit({ organizationId, actorUserId, action: "material.updated", entityType: "material", entityId: materialId }, session);
      return { material, category };
    });
    return view(result.material, result.category);
  } catch (error) { return mutationError(error); }
}

async function changeArchive(identity: CurrentIdentity, materialId: string, restore: boolean): Promise<MaterialView> {
  requirePermission(identity, "material.manage");
  await connectToDatabase();
  await ensureAuditReady();
  const organizationId = objectId(identity.context.organizationId);
  const actorUserId = objectId(identity.context.userId);
  try {
    const result = await mongoose.connection.transaction(async (session) => {
      const material = await findMaterial(organizationId, objectId(materialId), session);
      if (!material) throw new AppError("MATERIAL_NOT_FOUND", "Material not found.", 404);
      if (restore && material.status !== "ARCHIVED") throw new AppError("MATERIAL_NOT_ARCHIVED", "This material is not archived.", 409);
      if (!restore && material.status === "ARCHIVED") throw new AppError("MATERIAL_ARCHIVED", "This material is already archived.", 409);
      const category = await findCategory(organizationId, material.categoryId, session);
      if (!category) throw new AppError("MATERIAL_CATEGORY_MISSING", "Material category is missing.", 500);
      if (restore) {
        if (!await lockActiveCategory(organizationId, category._id, session)) throw new AppError("CATEGORY_NOT_ACTIVE", "Restore or choose an active category before restoring this material.", 409);
        material.status = "ACTIVE";
        material.deletedAt = null;
        material.deletedBy = null;
      } else {
        if (await hasMaterialStock(organizationId, material._id, session)) {
          throw new AppError("MATERIAL_HAS_ACTIVE_STOCK", "The material cannot be archived while stock remains at a site.", 409);
        }
        if (await hasOpenPurchaseOrderForMaterial(organizationId, material._id, session)) {
          throw new AppError("MATERIAL_HAS_OPEN_WORKFLOW", "The material has an open purchase order.", 409);
        }
        if (await hasOpenTransferForMaterial(organizationId, material._id, session)) {
          throw new AppError("MATERIAL_HAS_OPEN_WORKFLOW", "The material has a transfer in progress.", 409);
        }
        material.status = "ARCHIVED";
        material.deletedAt = new Date();
        material.deletedBy = actorUserId;
      }
      await material.save({ session });
      await recordAudit({ organizationId, actorUserId, action: restore ? "material.restored" : "material.archived", entityType: "material", entityId: materialId }, session);
      return { material, category };
    });
    return view(result.material, result.category);
  } catch (error) { return mutationError(error); }
}

export const archiveMaterial = (identity: CurrentIdentity, materialId: string) => changeArchive(identity, materialId, false);
export const restoreMaterial = (identity: CurrentIdentity, materialId: string) => changeArchive(identity, materialId, true);
