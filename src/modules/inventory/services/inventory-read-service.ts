import "server-only";
import Decimal from "decimal.js";
import mongoose from "mongoose";
import type { CurrentIdentity } from "@/modules/auth/services/auth-service";
import { Material } from "@/modules/materials/models/material";
import type { MaterialUnit } from "@/modules/materials/types";
import { Site } from "@/modules/sites/models/site";
import { hasOrganizationWideSiteAccess, requirePermission, requireSiteAccess } from "@/server/auth/authorize";
import { connectToDatabase } from "@/server/db/connect";
import { AppError } from "@/shared/errors/app-error";
import { InventoryBalance } from "../models/inventory-balance";
import { InventoryBatch } from "../models/inventory-batch";
import { InventoryTransaction } from "../models/inventory-transaction";
import type { BalanceQuery, BatchQuery, TransactionQuery } from "../schemas/inventory";
import type { BalanceView, BatchView, InventoryMaterial, InventorySite, TransactionView } from "../types";

function id(value: string): mongoose.Types.ObjectId {
  if (!/^[a-fA-F0-9]{24}$/.test(value)) throw new AppError("INVENTORY_NOT_FOUND", "Inventory record not found.", 404);
  return new mongoose.Types.ObjectId(value);
}

function scope(identity: CurrentIdentity, siteId?: string, materialId?: string) {
  requirePermission(identity, "inventory.view");
  if (siteId) requireSiteAccess(identity, siteId);
  const allowed = hasOrganizationWideSiteAccess(identity) ? null : identity.context.assignedSiteIds.map(id);
  return {
    organizationId: id(identity.context.organizationId),
    siteId: siteId ? id(siteId) : allowed ? { $in: allowed } : undefined,
    materialId: materialId ? id(materialId) : undefined,
    inaccessible: allowed?.length === 0,
  };
}

async function references(identity: CurrentIdentity, docs: Array<{ siteId: mongoose.Types.ObjectId; materialId: mongoose.Types.ObjectId }>) {
  const organizationId = id(identity.context.organizationId);
  const siteIds = [...new Set(docs.map((doc) => doc.siteId.toString()))].map(id);
  const materialIds = [...new Set(docs.map((doc) => doc.materialId.toString()))].map(id);
  const [sites, materials] = await Promise.all([
    Site.find({ organizationId, _id: { $in: siteIds } }).select("code name"),
    Material.find({ organizationId, _id: { $in: materialIds } }).select("code name unit minimumStockLevel"),
  ]);
  const siteMap = new Map<string, InventorySite>(sites.map((site) => [site._id.toString(), { id: site._id.toString(), code: site.code, name: site.name }]));
  const materialMap = new Map<string, InventoryMaterial & { minimumStockLevel: string }>(materials.map((material) => [material._id.toString(), { id: material._id.toString(), code: material.code, name: material.name, unit: material.unit as MaterialUnit, minimumStockLevel: material.minimumStockLevel.toString() }]));
  const resolve = (siteId: mongoose.Types.ObjectId, materialId: mongoose.Types.ObjectId) => {
    const site = siteMap.get(siteId.toString());
    const material = materialMap.get(materialId.toString());
    if (!site || !material) throw new AppError("INVENTORY_REFERENCE_MISSING", "Inventory references are unavailable.", 500);
    return { site, material };
  };
  return resolve;
}

function pagination<T extends { _id: mongoose.Types.ObjectId }>(docs: T[], limit: number) {
  const hasMore = docs.length > limit;
  const page = docs.slice(0, limit);
  return { page, pagination: { nextCursor: hasMore ? page.at(-1)?._id.toString() ?? null : null, hasMore, limit } };
}

function balanceView(balance: InstanceType<typeof InventoryBalance>, resolve: Awaited<ReturnType<typeof references>>): BalanceView {
  const { site, material } = resolve(balance.siteId, balance.materialId);
  const minimumStockLevel = material.minimumStockLevel;
  const availableQuantity = balance.availableQuantity.toString();
  return {
    id: balance._id.toString(), site, material, onHandQuantity: balance.onHandQuantity.toString(),
    reservedQuantity: balance.reservedQuantity.toString(), availableQuantity, inventoryValue: new Decimal(balance.inventoryValue.toString()).toFixed(2),
    minimumStockLevel, lowStock: new Decimal(availableQuantity).lte(minimumStockLevel),
    version: balance.version, updatedAt: balance.updatedAt.toISOString(),
  };
}

export async function listBalances(identity: CurrentIdentity, query: BalanceQuery) {
  const scoped = scope(identity, query.siteId, query.materialId);
  if (scoped.inaccessible) return { balances: [] as BalanceView[], pagination: { nextCursor: null, hasMore: false, limit: query.limit } };
  await connectToDatabase();
  const filter = { organizationId: scoped.organizationId, ...(scoped.siteId ? { siteId: scoped.siteId } : {}), ...(scoped.materialId ? { materialId: scoped.materialId } : {}), ...(query.cursor ? { _id: { $lt: id(query.cursor) } } : {}) };
  let docs: InstanceType<typeof InventoryBalance>[];
  if (query.lowStock) {
    const compare = query.lowStock === "true" ? "$lte" : "$gt";
    const rows = await InventoryBalance.aggregate([
      { $match: filter },
      { $lookup: { from: "materials", localField: "materialId", foreignField: "_id", as: "stockMaterial" } },
      { $unwind: "$stockMaterial" },
      { $match: { $expr: { [compare]: ["$availableQuantity", "$stockMaterial.minimumStockLevel"] } } },
      { $sort: { _id: -1 } }, { $limit: query.limit + 1 },
    ]);
    docs = rows.map((row) => InventoryBalance.hydrate(row));
  } else {
    docs = await InventoryBalance.find(filter).sort({ _id: -1 }).limit(query.limit + 1);
  }
  const result = pagination(docs, query.limit);
  const resolve = await references(identity, result.page);
  return { balances: result.page.map((balance) => balanceView(balance, resolve)), pagination: result.pagination };
}

export async function getBalance(identity: CurrentIdentity, balanceId: string): Promise<BalanceView> {
  scope(identity);
  await connectToDatabase();
  const balance = await InventoryBalance.findOne({ _id: id(balanceId), organizationId: id(identity.context.organizationId) });
  if (!balance) throw new AppError("INVENTORY_NOT_FOUND", "Inventory balance not found.", 404);
  requireSiteAccess(identity, balance.siteId.toString());
  return balanceView(balance, await references(identity, [balance]));
}

function batchView(batch: InstanceType<typeof InventoryBatch>, resolve: Awaited<ReturnType<typeof references>>): BatchView {
  const { site, material } = resolve(batch.siteId, batch.materialId);
  return { id: batch._id.toString(), site, material, batchCode: batch.batchCode, receivedAt: batch.receivedAt.toISOString(), initialQuantity: batch.initialQuantity.toString(), remainingQuantity: batch.remainingQuantity.toString(), reservedQuantity: batch.reservedQuantity.toString(), unitCost: new Decimal(batch.unitCost.toString()).toFixed(2), status: batch.status as BatchView["status"], version: batch.version, sourceBatchId: batch.sourceBatchId?.toString() ?? null, goodsReceiptId: batch.goodsReceiptId?.toString() ?? null, sourceTransferId: batch.sourceTransferId?.toString() ?? null };
}

export async function listBatches(identity: CurrentIdentity, query: BatchQuery) {
  const scoped = scope(identity, query.siteId, query.materialId);
  if (scoped.inaccessible) return { batches: [] as BatchView[], pagination: { nextCursor: null, hasMore: false, limit: query.limit } };
  await connectToDatabase();
  const docs = await InventoryBatch.find({ organizationId: scoped.organizationId, ...(scoped.siteId ? { siteId: scoped.siteId } : {}), ...(scoped.materialId ? { materialId: scoped.materialId } : {}), ...(query.cursor ? { _id: { $lt: id(query.cursor) } } : {}) }).sort({ _id: -1 }).limit(query.limit + 1);
  const result = pagination(docs, query.limit);
  const resolve = await references(identity, result.page);
  return { batches: result.page.map((batch) => batchView(batch, resolve)), pagination: result.pagination };
}

export async function getBatch(identity: CurrentIdentity, batchId: string): Promise<BatchView> {
  scope(identity);
  await connectToDatabase();
  const batch = await InventoryBatch.findOne({ _id: id(batchId), organizationId: id(identity.context.organizationId) });
  if (!batch) throw new AppError("INVENTORY_NOT_FOUND", "Inventory batch not found.", 404);
  requireSiteAccess(identity, batch.siteId.toString());
  return batchView(batch, await references(identity, [batch]));
}

function transactionView(transaction: InstanceType<typeof InventoryTransaction>, resolve: Awaited<ReturnType<typeof references>>): TransactionView {
  const { site, material } = resolve(transaction.siteId, transaction.materialId);
  return { id: transaction._id.toString(), site, material, batchId: transaction.batchId?.toString() ?? null, type: transaction.type, quantity: transaction.quantity.toString(), unitCost: transaction.unitCost ? new Decimal(transaction.unitCost.toString()).toFixed(2) : null, referenceType: transaction.referenceType, referenceId: transaction.referenceId.toString(), reversalOfTransactionId: transaction.reversalOfTransactionId?.toString() ?? null, performedBy: transaction.performedBy.toString(), createdAt: transaction.createdAt.toISOString() };
}

export async function listTransactions(identity: CurrentIdentity, query: TransactionQuery) {
  const scoped = scope(identity, query.siteId, query.materialId);
  if (scoped.inaccessible) return { transactions: [] as TransactionView[], pagination: { nextCursor: null, hasMore: false, limit: query.limit } };
  await connectToDatabase();
  const docs = await InventoryTransaction.find({ organizationId: scoped.organizationId, ...(scoped.siteId ? { siteId: scoped.siteId } : {}), ...(scoped.materialId ? { materialId: scoped.materialId } : {}), ...(query.cursor ? { _id: { $lt: id(query.cursor) } } : {}) }).sort({ _id: -1 }).limit(query.limit + 1);
  const result = pagination(docs, query.limit);
  const resolve = await references(identity, result.page);
  return { transactions: result.page.map((transaction) => transactionView(transaction, resolve)), pagination: result.pagination };
}

export async function getTransaction(identity: CurrentIdentity, transactionId: string): Promise<TransactionView> {
  scope(identity);
  await connectToDatabase();
  const transaction = await InventoryTransaction.findOne({ _id: id(transactionId), organizationId: id(identity.context.organizationId) });
  if (!transaction) throw new AppError("INVENTORY_NOT_FOUND", "Inventory transaction not found.", 404);
  requireSiteAccess(identity, transaction.siteId.toString());
  return transactionView(transaction, await references(identity, [transaction]));
}

export async function listInventoryFilters(identity: CurrentIdentity) {
  const scoped = scope(identity);
  await connectToDatabase();
  const [sites, materials] = await Promise.all([
    Site.find({ organizationId: scoped.organizationId, ...(scoped.siteId ? { _id: scoped.siteId } : {}), deletedAt: null }).select("code name").sort({ name: 1 }),
    Material.find({ organizationId: scoped.organizationId, status: "ACTIVE", deletedAt: null }).select("code name").sort({ name: 1 }),
  ]);
  return { sites: sites.map((site) => ({ id: site._id.toString(), code: site.code, name: site.name })), materials: materials.map((material) => ({ id: material._id.toString(), code: material.code, name: material.name })) };
}
