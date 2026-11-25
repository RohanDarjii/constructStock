import "server-only";
import { createHash } from "node:crypto";
import Decimal from "decimal.js";
import mongoose from "mongoose";
import { ensureAuditReady, recordAudit } from "@/modules/audit/services/record-audit";
import { User } from "@/modules/auth/models/identity";
import type { CurrentIdentity } from "@/modules/auth/services/auth-service";
import { isDuplicateKey } from "@/modules/auth/services/security";
import { InventoryBalance } from "@/modules/inventory/models/inventory-balance";
import { InventoryBatch } from "@/modules/inventory/models/inventory-batch";
import { IdempotencyKey } from "@/modules/inventory/models/idempotency-key";
import { InventoryTransaction } from "@/modules/inventory/models/inventory-transaction";
import { FileAttachment } from "@/modules/files/models/file-attachment";
import { linkAttachmentToWastage } from "@/modules/files/services/file-attachment-service";
import { GoodsReceipt } from "@/modules/receiving/models/goods-receipt";
import { allocateStockOut } from "@/modules/inventory/services/stock-allocation-service";
import { Material } from "@/modules/materials/models/material";
import { quantityFitsUnit } from "@/modules/materials/schemas/catalogue";
import type { MaterialUnit } from "@/modules/materials/types";
import { Site } from "@/modules/sites/models/site";
import { hasOrganizationWideSiteAccess, requirePermission, requireSiteAccess } from "@/server/auth/authorize";
import { connectToDatabase } from "@/server/db/connect";
import { AppError } from "@/shared/errors/app-error";
import { Wastage } from "../models/wastage";
import type { CreateWastageInput, ListWastagesQuery } from "../schemas/wastage";
import type { WastageMutationResult, WastageView, WastageOptions, WastageSummary } from "../types";

type WastageDocument = InstanceType<typeof Wastage>;
const D = Decimal.clone({ precision: 80 });
const zero = new D(0);
const maxMoney = new D(`${"9".repeat(32)}.99`);
const retentionMs = 7 * 24 * 60 * 60 * 1000;
const keyPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;
const id = (value: string) => {
  if (!/^[a-fA-F0-9]{24}$/.test(value)) throw new AppError("WASTAGE_NOT_FOUND", "Wastage record not found.", 404);
  return new mongoose.Types.ObjectId(value);
};
const stored = (value: string | Decimal) => mongoose.Types.Decimal128.fromString(new D(value).toString());
const money = (value: Decimal) => value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
const moneyString = (value: mongoose.Types.Decimal128) => new D(value.toString()).toFixed(2);
const fingerprint = (input: unknown) => createHash("sha256").update(JSON.stringify(input)).digest("hex");
const escaped = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const emptySummary = (): WastageSummary => ({ totalRecords: 0, confirmedRecords: 0, reversedRecords: 0, affectedSites: 0, valueLost: "0.00", wastagePercentage: null, receivedQuantity: null, wastedQuantity: null });

function checkMoney(value: Decimal) {
  if (value.lt(0) || value.gt(maxMoney)) throw new AppError("INVENTORY_VALUE_CONFLICT", "Stock value is outside the supported range.", 409);
}

async function ready() {
  await Promise.all([Wastage.init(), FileAttachment.init(), InventoryBalance.init(), InventoryBatch.init(), InventoryTransaction.init(), IdempotencyKey.init(), ensureAuditReady()]);
}

async function previousResult(organizationId: mongoose.Types.ObjectId, key: string, operation: string, hash: string): Promise<WastageMutationResult | null> {
  const previous = await IdempotencyKey.findOne({ organizationId, key });
  if (!previous) return null;
  if (previous.operation !== operation || previous.requestHash !== hash) throw new AppError("IDEMPOTENCY_KEY_REUSED", "This idempotency key was already used with a different request.", 409);
  return previous.responseBody as WastageMutationResult;
}

async function saveIdempotency(organizationId: mongoose.Types.ObjectId, key: string, operation: string, hash: string, result: WastageMutationResult, session: mongoose.ClientSession) {
  await IdempotencyKey.create([{ organizationId, key, operation, requestHash: hash, responseStatus: operation === "wastage.confirm" ? 201 : 200, resourceId: id(result.id), responseBody: result, expiresAt: new Date(Date.now() + retentionMs) }], { session });
}

async function views(organizationId: mongoose.Types.ObjectId, records: WastageDocument[]): Promise<WastageView[]> {
  if (!records.length) return [];
  const ids = (values: string[]) => [...new Set(values)].map(id);
  const [sites, materials, users, batches, attachments] = await Promise.all([
    Site.find({ organizationId, _id: { $in: ids(records.map((record) => record.siteId.toString())) } }).select("name code"),
    Material.find({ organizationId, _id: { $in: ids(records.map((record) => record.materialId.toString())) } }).select("name code unit"),
    User.find({ _id: { $in: ids(records.map((record) => record.createdBy.toString())) } }).select("name"),
    InventoryBatch.find({ organizationId, _id: { $in: ids(records.flatMap((record) => record.batchAllocations.map((entry) => entry.batchId.toString()))) } }).select("batchCode"),
    FileAttachment.find({ organizationId, linkedEntityType: "WASTAGE", linkedEntityId: { $in: records.map((record) => record._id) }, uploadState: "READY" }).select("linkedEntityId fileName mimeType size"),
  ]);
  const map = <T extends { _id: mongoose.Types.ObjectId }>(values: T[]) => new Map(values.map((value) => [value._id.toString(), value]));
  const siteMap = map(sites), materialMap = map(materials), userMap = map(users), batchMap = map(batches);
  return records.map((record) => {
    const site = siteMap.get(record.siteId.toString());
    const material = materialMap.get(record.materialId.toString());
    if (!site || !material) throw new AppError("WASTAGE_REFERENCE_MISSING", "Wastage references are unavailable.", 500);
    return {
      id: record._id.toString(), wastageNumber: record.wastageNumber, status: record.status as WastageView["status"],
      site: { id: site._id.toString(), code: site.code, name: site.name },
      material: { id: material._id.toString(), code: material.code, name: material.name, unit: material.unit as MaterialUnit },
      quantity: record.quantity.toString(), wastedAt: record.wastedAt.toISOString(), createdAt: record.createdAt.toISOString(),
      activity: record.activity ?? null, reason: record.reason as WastageView["reason"], notes: record.notes ?? null,
      allocationMethod: record.allocationMethod as WastageView["allocationMethod"], overrideReason: record.overrideReason ?? null,
      stockBefore: record.stockBefore.toString(), stockAfter: record.stockAfter.toString(), onHandBefore: record.onHandBefore.toString(), onHandAfter: record.onHandAfter.toString(), valueRemoved: moneyString(record.valueRemoved),
      createdBy: { id: record.createdBy.toString(), name: userMap.get(record.createdBy.toString())?.name ?? "Former member" },
      reversedAt: record.reversedAt?.toISOString() ?? null, reversedBy: record.reversedBy?.toString() ?? null,
      reversalReason: record.reversalReason ?? null, reversalValue: record.reversalValue ? moneyString(record.reversalValue) : null,
      batchAllocations: record.batchAllocations.map((entry) => ({
        batchId: entry.batchId.toString(), batchCode: batchMap.get(entry.batchId.toString())?.batchCode ?? "Former batch",
        quantity: entry.quantity.toString(), unitCost: moneyString(entry.unitCostSnapshot),
        valueRemoved: moneyString(entry.valueRemoved), transactionId: entry.transactionId.toString(),
      })),
      attachments: attachments.filter((attachment) => attachment.linkedEntityId?.equals(record._id)).map((attachment) => ({ id: attachment._id.toString(), fileName: attachment.fileName, mimeType: attachment.mimeType, size: attachment.size })),
    };
  });
}

export async function listWastages(identity: CurrentIdentity, query: ListWastagesQuery) {
  requirePermission(identity, "inventory.view");
  if (query.siteId) requireSiteAccess(identity, query.siteId);
  const allowed = hasOrganizationWideSiteAccess(identity) ? null : identity.context.assignedSiteIds.map(id);
  if (allowed?.length === 0) return { wastages: [] as WastageView[], summary: emptySummary(), pagination: { nextCursor: null, hasMore: false, limit: query.limit } };
  await connectToDatabase();
  const organizationId = id(identity.context.organizationId);
  const filter = {
    organizationId,
    ...(query.siteId ? { siteId: id(query.siteId) } : allowed ? { siteId: { $in: allowed } } : {}),
    ...(query.materialId ? { materialId: id(query.materialId) } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.q ? { wastageNumber: { $regex: escaped(query.q), $options: "i" } } : {}),
    ...(query.reason ? { reason: query.reason } : {}),
    ...(query.from || query.to ? { wastedAt: { ...(query.from ? { $gte: new Date(`${query.from}T00:00:00.000Z`) } : {}), ...(query.to ? { $lte: new Date(`${query.to}T23:59:59.999Z`) } : {}) } } : {}),
  };
  const ratioScope = { organizationId, materialId: query.materialId ? id(query.materialId) : undefined, status: "CONFIRMED", ...(query.siteId ? { siteId: id(query.siteId) } : allowed ? { siteId: { $in: allowed } } : {}), ...(query.from || query.to ? { wastedAt: { ...(query.from ? { $gte: new Date(`${query.from}T00:00:00.000Z`) } : {}), ...(query.to ? { $lte: new Date(`${query.to}T23:59:59.999Z`) } : {}) } } : {}) };
  const [docs, aggregates, receiptTotals, ratioTotals] = await Promise.all([
    Wastage.find({ ...filter, ...(query.cursor ? { _id: { $lt: id(query.cursor) } } : {}) }).sort({ _id: -1 }).limit(query.limit + 1),
    Wastage.aggregate([{ $match: filter }, { $group: { _id: null, count: { $sum: 1 }, confirmed: { $sum: { $cond: [{ $eq: ["$status", "CONFIRMED"] }, 1, 0] } }, sites: { $addToSet: "$siteId" }, value: { $sum: { $cond: [{ $eq: ["$status", "CONFIRMED"] }, "$valueRemoved", 0] } }, quantity: { $sum: { $cond: [{ $eq: ["$status", "CONFIRMED"] }, "$quantity", 0] } } } }]),
    query.materialId ? GoodsReceipt.aggregate([{ $match: { organizationId, status: "CONFIRMED", ...(query.siteId ? { siteId: id(query.siteId) } : allowed ? { siteId: { $in: allowed } } : {}), ...(query.from || query.to ? { receivedAt: { ...(query.from ? { $gte: new Date(`${query.from}T00:00:00.000Z`) } : {}), ...(query.to ? { $lte: new Date(`${query.to}T23:59:59.999Z`) } : {}) } } : {}) } }, { $unwind: "$items" }, { $match: { "items.materialId": id(query.materialId) } }, { $group: { _id: null, quantity: { $sum: "$items.quantityReceived" } } }]) : Promise.resolve([]),
    query.materialId ? Wastage.aggregate([{ $match: ratioScope }, { $group: { _id: null, quantity: { $sum: "$quantity" } } }]) : Promise.resolve([]),
  ]);
  const hasMore = docs.length > query.limit;
  const page = docs.slice(0, query.limit);
  const aggregate = aggregates[0];
  const summary = emptySummary();
  if (aggregate) {
    summary.totalRecords = aggregate.count;
    summary.confirmedRecords = aggregate.confirmed;
    summary.reversedRecords = aggregate.count - aggregate.confirmed;
    summary.affectedSites = aggregate.sites.length;
    summary.valueLost = money(new D(aggregate.value.toString())).toFixed(2);
  }
  if (query.materialId) {
    const received = new D(receiptTotals[0]?.quantity?.toString() ?? 0);
    const wasted = new D(ratioTotals[0]?.quantity?.toString() ?? 0);
    summary.receivedQuantity = received.toString();
    summary.wastedQuantity = wasted.toString();
    summary.wastagePercentage = received.gt(0) ? wasted.div(received).times(100).toDecimalPlaces(2).toFixed(2) : null;
  }
  return { wastages: await views(organizationId, page), summary, pagination: { nextCursor: hasMore ? page.at(-1)?._id.toString() ?? null : null, hasMore, limit: query.limit } };
}

export async function getWastage(identity: CurrentIdentity, wastageId: string): Promise<WastageView> {
  requirePermission(identity, "inventory.view");
  await connectToDatabase();
  const organizationId = id(identity.context.organizationId);
  const record = await Wastage.findOne({ _id: id(wastageId), organizationId });
  if (!record) throw new AppError("WASTAGE_NOT_FOUND", "Wastage record not found.", 404);
  requireSiteAccess(identity, record.siteId.toString());
  return (await views(organizationId, [record]))[0];
}

export async function listWastageFilters(identity: CurrentIdentity) {
  requirePermission(identity, "inventory.view");
  await connectToDatabase();
  const organizationId = id(identity.context.organizationId);
  const allowed = hasOrganizationWideSiteAccess(identity) ? null : identity.context.assignedSiteIds.map(id);
  const [sites, materials] = await Promise.all([
    Site.find({ organizationId, ...(allowed ? { _id: { $in: allowed } } : {}) }).select("code name").sort({ name: 1 }),
    Material.find({ organizationId }).select("code name").sort({ name: 1 }),
  ]);
  return { sites: sites.map((site) => ({ id: site._id.toString(), code: site.code, name: site.name })), materials: materials.map((material) => ({ id: material._id.toString(), code: material.code, name: material.name })) };
}

export async function getWastageOptions(identity: CurrentIdentity, siteId?: string, materialId?: string): Promise<WastageOptions> {
  requirePermission(identity, "wastage.create");
  if (siteId) requireSiteAccess(identity, siteId);
  if (materialId && !siteId) throw new AppError("VALIDATION_ERROR", "Select a site before choosing a material.", 422);
  await connectToDatabase();
  const organizationId = id(identity.context.organizationId);
  const allowed = hasOrganizationWideSiteAccess(identity) ? null : identity.context.assignedSiteIds.map(id);
  const sites = await Site.find({ organizationId, status: "ACTIVE", deletedAt: null, ...(allowed ? { _id: { $in: allowed } } : {}) }).select("code name").sort({ name: 1 });
  if (siteId && !sites.some((site) => site._id.toString() === siteId.toLowerCase())) throw new AppError("SITE_NOT_FOUND", "Choose an active assigned site.", 404);
  const materials = siteId ? await Material.find({ organizationId, status: "ACTIVE", deletedAt: null }).select("code name unit").sort({ name: 1 }) : [];
  if (materialId && !materials.some((material) => material._id.toString() === materialId.toLowerCase())) throw new AppError("MATERIAL_NOT_FOUND", "Choose an active material.", 404);
  const scope = materialId ? { organizationId, siteId: id(siteId!), materialId: id(materialId) } : null;
  const [balance, batches] = scope ? await Promise.all([
    InventoryBalance.findOne(scope),
    InventoryBatch.find({ ...scope, status: "ACTIVE" }).sort({ receivedAt: 1, _id: 1 }),
  ]) : [null, []];
  return {
    sites: sites.map((site) => ({ id: site._id.toString(), code: site.code, name: site.name })),
    materials: materials.map((material) => ({ id: material._id.toString(), code: material.code, name: material.name, unit: material.unit as MaterialUnit })),
    stock: balance ? { onHand: balance.onHandQuantity.toString(), reserved: balance.reservedQuantity.toString(), available: balance.availableQuantity.toString(), version: balance.version } : null,
    batches: batches.map((batch) => ({ id: batch._id.toString(), batchCode: batch.batchCode, receivedAt: batch.receivedAt.toISOString(), remaining: batch.remainingQuantity.toString(), available: new D(batch.remainingQuantity.toString()).minus(batch.reservedQuantity.toString()).toString(), unitCost: moneyString(batch.unitCost) })).filter((batch) => new D(batch.available).gt(0)),
  };
}

export async function createWastage(identity: CurrentIdentity, input: CreateWastageInput, key: string): Promise<WastageMutationResult> {
  requirePermission(identity, "wastage.create");
  if (input.allocationMethod === "MANUAL") requirePermission(identity, "inventory.adjust");
  requireSiteAccess(identity, input.siteId);
  if (!keyPattern.test(key)) throw new AppError("IDEMPOTENCY_KEY_REQUIRED", "Provide a valid Idempotency-Key header.", 400);
  await connectToDatabase();
  await ready();
  const organizationId = id(identity.context.organizationId);
  const siteId = id(input.siteId);
  const materialId = id(input.materialId);
  const actorUserId = id(identity.context.userId);
  if (!await Site.exists({ _id: siteId, organizationId })) throw new AppError("SITE_NOT_FOUND", "Site not found.", 404);
  const hash = fingerprint(input);
  const replay = await previousResult(organizationId, key, "wastage.confirm", hash);
  if (replay) return replay;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await mongoose.connection.transaction(async (session) => {
        const site = await Site.findOneAndUpdate({ _id: siteId, organizationId, status: "ACTIVE", deletedAt: null }, { $inc: { __v: 1 } }, { session });
        if (!site) throw new AppError("SITE_NOT_ACTIVE", "The wastage site must be active.", 409);
        const material = await Material.findOne({ _id: materialId, organizationId, status: "ACTIVE", deletedAt: null }).session(session);
        if (!material) throw new AppError("MATERIAL_NOT_ACTIVE", "The material must be active.", 409);
        if (!quantityFitsUnit(input.quantity, material.unit as MaterialUnit, true)) throw new AppError("INVALID_WASTAGE_QUANTITY", "Quantity does not match the material unit.", 422);
        const locked = await Material.updateOne({ _id: materialId, organizationId, status: "ACTIVE", deletedAt: null, unit: material.unit, __v: material.__v }, { $inc: { __v: 1 } }, { session });
        if (locked.matchedCount !== 1) throw new AppError("MATERIAL_CHANGED", "Material details changed. Reload and try again.", 409);
        const scope = { organizationId, siteId, materialId };
        const balance = await InventoryBalance.findOne(scope).session(session);
        const quantity = new D(input.quantity);
        if (!balance || new D(balance.availableQuantity.toString()).lt(quantity)) throw new AppError("INSUFFICIENT_STOCK", "Requested quantity exceeds available stock.", 409);
        if (input.allocationMethod === "MANUAL") for (const allocation of input.batchAllocations ?? []) {
          if (!quantityFitsUnit(allocation.quantity, material.unit as MaterialUnit, true)) throw new AppError("INVALID_BATCH_ALLOCATION", "Batch quantity does not match the material unit.", 422);
        }
        const result = await allocateStockOut(scope, input.quantity, input.allocationMethod, input.batchAllocations, session);
        checkMoney(result.valueRemoved);
        const nextOnHand = new D(balance.onHandQuantity.toString()).minus(quantity);
        const nextAvailable = new D(balance.availableQuantity.toString()).minus(quantity);
        const nextValue = new D(balance.inventoryValue.toString()).minus(result.valueRemoved);
        if (nextOnHand.lt(0) || nextAvailable.lt(0) || nextValue.lt(0)) throw new AppError("INVENTORY_VALUE_CONFLICT", "Inventory balance cannot become negative.", 409);
        const balanceUpdate = await InventoryBalance.updateOne({ _id: balance._id, ...scope, version: balance.version, availableQuantity: { $gte: stored(quantity) } }, { $set: { onHandQuantity: stored(nextOnHand), availableQuantity: stored(nextAvailable), inventoryValue: stored(nextValue) }, $inc: { version: 1 } }, { session });
        if (balanceUpdate.matchedCount !== 1) throw new AppError("INVENTORY_VERSION_CONFLICT", "Site stock changed. Reload and try again.", 409);
        const wastageId = new mongoose.Types.ObjectId();
        const wastageNumber = `WST-${new Date().getUTCFullYear()}-${wastageId.toString().slice(-12).toUpperCase()}`;
        const allocations = result.allocations.map((allocation) => ({ ...allocation, transactionId: new mongoose.Types.ObjectId() }));
        for (const attachmentId of input.attachmentIds) await linkAttachmentToWastage(organizationId, siteId, actorUserId, attachmentId, wastageId, session);
        await Wastage.create([{ _id: wastageId, ...scope, wastageNumber, quantity: stored(quantity), wastedAt: new Date(input.wastedAt), activity: input.activity ?? null, reason: input.reason, notes: input.notes ?? null, allocationMethod: input.allocationMethod, overrideReason: input.overrideReason ?? null, batchAllocations: allocations, attachmentIds: input.attachmentIds.map(id), stockBefore: balance.availableQuantity, stockAfter: stored(nextAvailable), onHandBefore: balance.onHandQuantity, onHandAfter: stored(nextOnHand), valueRemoved: stored(result.valueRemoved), createdBy: actorUserId, status: "CONFIRMED" }], { session });
        await InventoryTransaction.create(allocations.map((allocation) => ({ _id: allocation.transactionId, ...scope, batchId: allocation.batchId, type: "WASTAGE", quantity: stored(new D(allocation.quantity.toString()).negated()), unitCost: allocation.unitCostSnapshot, referenceType: "WASTAGE", referenceId: wastageId, performedBy: actorUserId })), { session, ordered: true });
        await recordAudit({ organizationId, actorUserId, action: "wastage.confirmed", entityType: "wastage", entityId: wastageId.toString() }, session);
        const response: WastageMutationResult = { id: wastageId.toString(), wastageNumber, status: "CONFIRMED" };
        await saveIdempotency(organizationId, key, "wastage.confirm", hash, response, session);
        return response;
      });
    } catch (error) {
      const committed = await previousResult(organizationId, key, "wastage.confirm", hash);
      if (committed) return committed;
      if (isDuplicateKey(error) && attempt < 2) continue;
      if (isDuplicateKey(error)) throw new AppError("WASTAGE_CONFLICT", "The wastage record conflicted with another request. Retry shortly.", 409);
      if (error instanceof Error && error.name === "VersionError") throw new AppError("INVENTORY_VERSION_CONFLICT", "Site stock changed. Reload and try again.", 409);
      throw error;
    }
  }
  throw new AppError("WASTAGE_CONFLICT", "The wastage record conflicted with another request. Retry shortly.", 409);
}

export async function reverseWastage(identity: CurrentIdentity, wastageId: string, reason: string, key: string): Promise<WastageMutationResult> {
  requirePermission(identity, "inventory.adjust");
  if (!keyPattern.test(key)) throw new AppError("IDEMPOTENCY_KEY_REQUIRED", "Provide a valid Idempotency-Key header.", 400);
  await connectToDatabase();
  await ready();
  const organizationId = id(identity.context.organizationId);
  const actorUserId = id(identity.context.userId);
  const recordId = id(wastageId);
  const scoped = await Wastage.findOne({ _id: recordId, organizationId }).select("siteId");
  if (!scoped) throw new AppError("WASTAGE_NOT_FOUND", "Wastage record not found.", 404);
  requireSiteAccess(identity, scoped.siteId.toString());
  const hash = fingerprint({ wastageId: recordId.toString(), reason });
  const replay = await previousResult(organizationId, key, "wastage.reverse", hash);
  if (replay) return replay;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await mongoose.connection.transaction(async (session) => {
        const record = await Wastage.findOne({ _id: recordId, organizationId }).session(session);
        if (!record || record.status !== "CONFIRMED") throw new AppError("WASTAGE_NOT_REVERSIBLE", "This wastage record is not eligible for reversal.", 409);
        const scope = { organizationId, siteId: record.siteId, materialId: record.materialId };
        let restored: Decimal = zero;
        for (const allocation of record.batchAllocations) {
          const batch = await InventoryBatch.findOne({ _id: allocation.batchId, ...scope }).session(session);
          if (!batch || !["ACTIVE", "DEPLETED"].includes(batch.status)) throw new AppError("ISSUE_BATCH_UNAVAILABLE", "The original batch cannot be restored. Use an authorized stock adjustment.", 409);
          const current = new D(batch.remainingQuantity.toString());
          const quantity = new D(allocation.quantity.toString());
          const next = current.plus(quantity);
          if (next.gt(batch.initialQuantity.toString())) throw new AppError("ISSUE_BATCH_CONFLICT", "The original batch quantity is inconsistent.", 409);
          const cost = new D(batch.unitCost.toString());
          const valueAdded = money(next.times(cost)).minus(money(current.times(cost)));
          const updated = await InventoryBatch.updateOne({ _id: batch._id, ...scope, version: batch.version, status: batch.status, remainingQuantity: batch.remainingQuantity, reservedQuantity: batch.reservedQuantity }, { $set: { remainingQuantity: stored(next), status: "ACTIVE" }, $inc: { version: 1 } }, { session });
          if (updated.matchedCount !== 1) throw new AppError("INVENTORY_VERSION_CONFLICT", "A batch changed. Reload and try again.", 409);
          restored = restored.plus(valueAdded);
          await InventoryTransaction.create([{ ...scope, batchId: batch._id, type: "REVERSAL", quantity: allocation.quantity, unitCost: allocation.unitCostSnapshot, referenceType: "WASTAGE", referenceId: record._id, reversalOfTransactionId: allocation.transactionId, performedBy: actorUserId }], { session });
        }
        const balance = await InventoryBalance.findOne(scope).session(session);
        if (!balance) throw new AppError("INVENTORY_VERSION_CONFLICT", "The site balance is unavailable.", 409);
        const nextOnHand = new D(balance.onHandQuantity.toString()).plus(record.quantity.toString());
        const nextAvailable = new D(balance.availableQuantity.toString()).plus(record.quantity.toString());
        const nextValue = new D(balance.inventoryValue.toString()).plus(restored);
        checkMoney(nextValue);
        const updatedBalance = await InventoryBalance.updateOne({ _id: balance._id, ...scope, version: balance.version }, { $set: { onHandQuantity: stored(nextOnHand), availableQuantity: stored(nextAvailable), inventoryValue: stored(nextValue) }, $inc: { version: 1 } }, { session });
        if (updatedBalance.matchedCount !== 1) throw new AppError("INVENTORY_VERSION_CONFLICT", "Site stock changed. Reload and try again.", 409);
        record.status = "REVERSED"; record.reversedAt = new Date(); record.reversedBy = actorUserId; record.reversalReason = reason; record.reversalValue = stored(restored);
        await record.save({ session });
        await recordAudit({ organizationId, actorUserId, action: "wastage.reversed", entityType: "wastage", entityId: record._id.toString() }, session);
        const response: WastageMutationResult = { id: record._id.toString(), wastageNumber: record.wastageNumber, status: "REVERSED" };
        await saveIdempotency(organizationId, key, "wastage.reverse", hash, response, session);
        return response;
      });
    } catch (error) {
      const committed = await previousResult(organizationId, key, "wastage.reverse", hash);
      if (committed) return committed;
      if (isDuplicateKey(error) && attempt < 2) continue;
      if (isDuplicateKey(error)) throw new AppError("WASTAGE_CONFLICT", "The reversal conflicted with another request. Retry shortly.", 409);
      throw error;
    }
  }
  throw new AppError("WASTAGE_CONFLICT", "The reversal conflicted with another request. Retry shortly.", 409);
}
