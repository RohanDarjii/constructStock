import "server-only";
import mongoose from "mongoose";
import { ensureAuditReady, recordAudit } from "@/modules/audit/services/record-audit";
import type { CurrentIdentity } from "@/modules/auth/services/auth-service";
import { isDuplicateKey } from "@/modules/auth/services/security";
import { requirePermission } from "@/server/auth/authorize";
import { connectToDatabase } from "@/server/db/connect";
import { AppError } from "@/shared/errors/app-error";
import { MaterialCategory } from "../models/category";
import { ensureCatalogueReady, findCategory, listCategoryDocuments, materialsInCategory, type CategoryDocument } from "../repositories/catalogue-repository";
import type { CreateCategoryInput, ListCategoriesQuery, UpdateCategoryInput } from "../schemas/catalogue";
import type { CategoryView } from "../types";

function objectId(value: string): mongoose.Types.ObjectId {
  if (!/^[a-fA-F0-9]{24}$/.test(value)) throw new AppError("CATEGORY_NOT_FOUND", "Category not found.", 404);
  return new mongoose.Types.ObjectId(value);
}

function view(category: CategoryDocument): CategoryView {
  return {
    id: category._id.toString(), name: category.name, description: category.description ?? null,
    status: category.status as CategoryView["status"], createdAt: category.createdAt.toISOString(), updatedAt: category.updatedAt.toISOString(),
  };
}

function mutationError(error: unknown): never {
  if (isDuplicateKey(error)) throw new AppError("CATEGORY_EXISTS", "A category with this name already exists in your company.", 409);
  if (error instanceof Error && error.name === "VersionError") throw new AppError("CATEGORY_CHANGED", "This category changed. Reload and try again.", 409);
  throw error;
}

export async function listCategories(identity: CurrentIdentity, query: ListCategoriesQuery): Promise<CategoryView[]> {
  await connectToDatabase();
  const categories = await listCategoryDocuments(objectId(identity.context.organizationId), query.includeArchived === "true");
  return categories.map(view);
}

export async function createCategory(identity: CurrentIdentity, input: CreateCategoryInput): Promise<CategoryView> {
  requirePermission(identity, "material.manage");
  await connectToDatabase();
  await Promise.all([ensureCatalogueReady(), ensureAuditReady()]);
  const organizationId = objectId(identity.context.organizationId);
  const actorUserId = objectId(identity.context.userId);
  try {
    const category = await mongoose.connection.transaction(async (session) => {
      const [created] = await MaterialCategory.create([{ organizationId, name: input.name, nameKey: input.name.normalize("NFKC").toLowerCase(), description: input.description ?? null }], { session });
      await recordAudit({ organizationId, actorUserId, action: "material_category.created", entityType: "material_category", entityId: created._id.toString() }, session);
      return created;
    });
    return view(category);
  } catch (error) { return mutationError(error); }
}

export async function updateCategory(identity: CurrentIdentity, categoryId: string, input: UpdateCategoryInput): Promise<CategoryView> {
  requirePermission(identity, "material.manage");
  await connectToDatabase();
  await ensureAuditReady();
  const organizationId = objectId(identity.context.organizationId);
  const actorUserId = objectId(identity.context.userId);
  try {
    const category = await mongoose.connection.transaction(async (session) => {
      const existing = await findCategory(organizationId, objectId(categoryId), session);
      if (!existing) throw new AppError("CATEGORY_NOT_FOUND", "Category not found.", 404);
      if (existing.status === "ARCHIVED") throw new AppError("CATEGORY_ARCHIVED", "Archived categories cannot be edited.", 409);
      if (input.name !== undefined) { existing.name = input.name; existing.nameKey = input.name.normalize("NFKC").toLowerCase(); }
      if (input.description !== undefined) existing.description = input.description;
      await existing.save({ session });
      await recordAudit({ organizationId, actorUserId, action: "material_category.updated", entityType: "material_category", entityId: categoryId }, session);
      return existing;
    });
    return view(category);
  } catch (error) { return mutationError(error); }
}

export async function archiveCategory(identity: CurrentIdentity, categoryId: string): Promise<CategoryView> {
  requirePermission(identity, "material.manage");
  await connectToDatabase();
  await ensureAuditReady();
  const organizationId = objectId(identity.context.organizationId);
  const actorUserId = objectId(identity.context.userId);
  try {
    const category = await mongoose.connection.transaction(async (session) => {
      const existing = await findCategory(organizationId, objectId(categoryId), session);
      if (!existing) throw new AppError("CATEGORY_NOT_FOUND", "Category not found.", 404);
      if (existing.status === "ARCHIVED") throw new AppError("CATEGORY_ARCHIVED", "This category is already archived.", 409);
      if (await materialsInCategory(organizationId, existing._id, session)) {
        throw new AppError("CATEGORY_HAS_MATERIALS", "Move the materials in this category before archiving it.", 409);
      }
      existing.status = "ARCHIVED";
      existing.deletedAt = new Date();
      await existing.save({ session });
      await recordAudit({ organizationId, actorUserId, action: "material_category.archived", entityType: "material_category", entityId: categoryId }, session);
      return existing;
    });
    return view(category);
  } catch (error) { return mutationError(error); }
}
