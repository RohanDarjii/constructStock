import "server-only";
import mongoose from "mongoose";
import { MaterialCategory } from "../models/category";
import { Material } from "../models/material";
import type { CatalogueStatus } from "../types";

export type CategoryDocument = InstanceType<typeof MaterialCategory>;
export type MaterialDocument = InstanceType<typeof Material>;

export async function ensureCatalogueReady(): Promise<void> {
  await Promise.all([MaterialCategory.init(), Material.init()]);
}

export function findCategory(organizationId: mongoose.Types.ObjectId, categoryId: mongoose.Types.ObjectId, session?: mongoose.ClientSession) {
  return MaterialCategory.findOne({ organizationId, _id: categoryId }).session(session ?? null);
}

export function listCategoryDocuments(organizationId: mongoose.Types.ObjectId, includeArchived: boolean) {
  return MaterialCategory.find({ organizationId, ...(includeArchived ? {} : { status: "ACTIVE" }) }).sort({ nameKey: 1, _id: 1 });
}

export function findCategoriesByIds(organizationId: mongoose.Types.ObjectId, categoryIds: mongoose.Types.ObjectId[]) {
  return MaterialCategory.find({ organizationId, _id: { $in: categoryIds } });
}

export async function lockActiveCategory(organizationId: mongoose.Types.ObjectId, categoryId: mongoose.Types.ObjectId, session: mongoose.ClientSession): Promise<boolean> {
  const result = await MaterialCategory.updateOne({ organizationId, _id: categoryId, status: "ACTIVE" }, { $inc: { catalogVersion: 1 } }, { session });
  return result.matchedCount === 1;
}

export function findMaterial(organizationId: mongoose.Types.ObjectId, materialId: mongoose.Types.ObjectId, session?: mongoose.ClientSession) {
  return Material.findOne({ organizationId, _id: materialId }).session(session ?? null);
}

export function materialsInCategory(organizationId: mongoose.Types.ObjectId, categoryId: mongoose.Types.ObjectId, session: mongoose.ClientSession) {
  return Material.exists({ organizationId, categoryId }).session(session);
}

export function listMaterialDocuments(input: { organizationId: mongoose.Types.ObjectId; status: CatalogueStatus; categoryId?: mongoose.Types.ObjectId; q?: string; cursor?: mongoose.Types.ObjectId; limit: number }) {
  const search = input.q?.trim();
  const regexMeta = new Set([".", "+", "*", "?", "^", "$", "(", ")", "[", "]", "{", "}", "|", String.fromCharCode(92)]);
  const escaped = search ? [...search].map((character) => regexMeta.has(character) ? String.fromCharCode(92) + character : character).join("") : undefined;
  return Material.find({
    organizationId: input.organizationId,
    status: input.status,
    ...(input.categoryId ? { categoryId: input.categoryId } : {}),
    ...(input.cursor ? { _id: { $lt: input.cursor } } : {}),
    ...(escaped ? { $or: [{ code: { $regex: escaped, $options: "i" } }, { name: { $regex: escaped, $options: "i" } }] } : {}),
  }).sort({ _id: -1 }).limit(input.limit + 1);
}
