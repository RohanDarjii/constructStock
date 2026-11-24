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
import { allocateStockOut } from "@/modules/inventory/services/stock-allocation-service";
import { Material } from "@/modules/materials/models/material";
import { quantityFitsUnit } from "@/modules/materials/schemas/catalogue";
import type { MaterialUnit } from "@/modules/materials/types";
import { Site } from "@/modules/sites/models/site";
import { hasOrganizationWideSiteAccess, requirePermission, requireSiteAccess } from "@/server/auth/authorize";
import { connectToDatabase } from "@/server/db/connect";
import { AppError } from "@/shared/errors/app-error";
import { Consumption } from "../models/consumption";
import type { CreateConsumptionInput, ListConsumptionsQuery } from "../schemas/consumption";
import type { ConsumptionMutationResult, ConsumptionView, IssueOptions } from "../types";

type ConsumptionDocument = InstanceType<typeof Consumption>;
const D = Decimal.clone({ precision: 80 });
const zero = new D(0);
const maxMoney = new D(`${"9".repeat(32)}.99`);
const retentionMs = 7 * 24 * 60 * 60 * 1000;
const keyPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;
const id = (value: string) => {
  if (!/^[a-fA-F0-9]{24}$/.test(value)) throw new AppError("CONSUMPTION_NOT_FOUND", "Material issue not found.", 404);
  return new mongoose.Types.ObjectId(value);
};
const stored = (value: string | Decimal) => mongoose.Types.Decimal128.fromString(new D(value).toString());
const money = (value: Decimal) => value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
const moneyString = (value: mongoose.Types.Decimal128) => new D(value.toString()).toFixed(2);
const fingerprint = (input: unknown) => createHash("sha256").update(JSON.stringify(input)).digest("hex");
const escaped = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function checkMoney(value: Decimal) {
  if (value.lt(0) || value.gt(maxMoney)) throw new AppError("INVENTORY_VALUE_CONFLICT", "Stock value is outside the supported range.", 409);
}

async function ready() {
  await Promise.all([Consumption.init(), InventoryBalance.init(), InventoryBatch.init(), InventoryTransaction.init(), IdempotencyKey.init(), ensureAuditReady()]);
}

async function previousResult(organizationId: mongoose.Types.ObjectId, key: string, operation: string, hash: string): Promise<ConsumptionMutationResult | null> {
  const previous = await IdempotencyKey.findOne({ organizationId, key });
  if (!previous) return null;
  if (previous.operation !== operation || previous.requestHash !== hash) throw new AppError("IDEMPOTENCY_KEY_REUSED", "This idempotency key was already used with a different request.", 409);
  return previous.responseBody as ConsumptionMutationResult;
}

async function saveIdempotency(organizationId: mongoose.Types.ObjectId, key: string, operation: string, hash: string, result: ConsumptionMutationResult, session: mongoose.ClientSession) {
  await IdempotencyKey.create([{ organizationId, key, operation, requestHash: hash, responseStatus: operation === "consumption.confirm" ? 201 : 200, resourceId: id(result.id), responseBody: result, expiresAt: new Date(Date.now() + retentionMs) }], { session });
}

async function views(organizationId: mongoose.Types.ObjectId, records: ConsumptionDocument[]): Promise<ConsumptionView[]> {
  if (!records.length) return [];
  const ids = (values: string[]) => [...new Set(values)].map(id);
  const [sites, materials, users, batches] = await Promise.all([
    Site.find({ organizationId, _id: { $in: ids(records.map((record) => record.siteId.toString())) } }).select("name code"),
    Material.find({ organizationId, _id: { $in: ids(records.map((record) => record.materialId.toString())) } }).select("name code unit"),
    User.find({ _id: { $in: ids(records.map((record) => record.createdBy.toString())) } }).select("name"),
    InventoryBatch.find({ organizationId, _id: { $in: ids(records.flatMap((record) => record.batchAllocations.map((entry) => entry.batchId.toString()))) } }).select("batchCode"),
  ]);
  const map = <T extends { _id: mongoose.Types.ObjectId }>(values: T[]) => new Map(values.map((value) => [value._id.toString(), value]));
  const siteMap = map(sites), materialMap = map(materials), userMap = map(users), batchMap = map(batches);
  return records.map((record) => {
    const site = siteMap.get(record.siteId.toString());
    const material = materialMap.get(record.materialId.toString());
    if (!site || !material) throw new AppError("CONSUMPTION_REFERENCE_MISSING", "Issue references are unavailable.", 500);
    return {
      id: record._id.toString(), issueNumber: record.issueNumber, status: record.status as ConsumptionView["status"],
      site: { id: site._id.toString(), code: site.code, name: site.name },
      material: { id: material._id.toString(), code: material.code, name: material.name, unit: material.unit as MaterialUnit },
      quantity: record.quantity.toString(), issuedAt: record.issuedAt.toISOString(), createdAt: record.createdAt.toISOString(),
      activity: record.activity, issuedTo: record.issuedTo, contractor: record.contractor ?? null,
      description: record.description ?? null, remarks: record.remarks ?? null,
      allocationMethod: record.allocationMethod as ConsumptionView["allocationMethod"], overrideReason: record.overrideReason ?? null,
      stockBefore: record.stockBefore.toString(), stockAfter: record.stockAfter.toString(), valueRemoved: moneyString(record.valueRemoved),
      createdBy: { id: record.createdBy.toString(), name: userMap.get(record.createdBy.toString())?.name ?? "Former member" },
      reversedAt: record.reversedAt?.toISOString() ?? null, reversedBy: record.reversedBy?.toString() ?? null,
      reversalReason: record.reversalReason ?? null, reversalValue: record.reversalValue ? moneyString(record.reversalValue) : null,
      batchAllocations: record.batchAllocations.map((entry) => ({
        batchId: entry.batchId.toString(), batchCode: batchMap.get(entry.batchId.toString())?.batchCode ?? "Former batch",
        quantity: entry.quantity.toString(), unitCost: moneyString(entry.unitCostSnapshot),
        valueRemoved: moneyString(entry.valueRemoved), transactionId: entry.transactionId.toString(),
      })),
    };
  });
}

export async function listConsumptions(identity: CurrentIdentity, query: ListConsumptionsQuery) {
  requirePermission(identity, "inventory.view");
  if (query.siteId) requireSiteAccess(identity, query.siteId);
  const allowed = hasOrganizationWideSiteAccess(identity) ? null : identity.context.assignedSiteIds.map(id);
  if (allowed?.length === 0) return { consumptions: [] as ConsumptionView[], pagination: { nextCursor: null, hasMore: false, limit: query.limit } };
  await connectToDatabase();
  const organizationId = id(identity.context.organizationId);
  const filter = {
    organizationId,
    ...(query.siteId ? { siteId: id(query.siteId) } : allowed ? { siteId: { $in: allowed } } : {}),
    ...(query.materialId ? { materialId: id(query.materialId) } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.q ? { issueNumber: { $regex: escaped(query.q), $options: "i" } } : {}),
    ...(query.activity ? { activity: { $regex: escaped(query.activity), $options: "i" } } : {}),
    ...(query.from || query.to ? { issuedAt: { ...(query.from ? { $gte: new Date(`${query.from}T00:00:00.000Z`) } : {}), ...(query.to ? { $lte: new Date(`${query.to}T23:59:59.999Z`) } : {}) } } : {}),
    ...(query.cursor ? { _id: { $lt: id(query.cursor) } } : {}),
  };
  const docs = await Consumption.find(filter).sort({ _id: -1 }).limit(query.limit + 1);
  const hasMore = docs.length > query.limit;
  const page = docs.slice(0, query.limit);
  return { consumptions: await views(organizationId, page), pagination: { nextCursor: hasMore ? page.at(-1)?._id.toString() ?? null : null, hasMore, limit: query.limit } };
}

export async function getConsumption(identity: CurrentIdentity, consumptionId: string): Promise<ConsumptionView> {
  requirePermission(identity, "inventory.view");
  await connectToDatabase();
  const organizationId = id(identity.context.organizationId);
  const record = await Consumption.findOne({ _id: id(consumptionId), organizationId });
  if (!record) throw new AppError("CONSUMPTION_NOT_FOUND", "Material issue not found.", 404);
  requireSiteAccess(identity, record.siteId.toString());
  return (await views(organizationId, [record]))[0];
}

export async function listConsumptionFilters(identity: CurrentIdentity) {
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

export async function getIssueOptions(identity: CurrentIdentity, siteId?: string, materialId?: string): Promise<IssueOptions> {
  requirePermission(identity, "inventory.consume");
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

export async function createConsumption(identity: CurrentIdentity, input: CreateConsumptionInput, key: string): Promise<ConsumptionMutationResult> {
  requirePermission(identity, "inventory.consume");
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
  const replay = await previousResult(organizationId, key, "consumption.confirm", hash);
  if (replay) return replay;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await mongoose.connection.transaction(async (session) => {
        const site = await Site.findOneAndUpdate({ _id: siteId, organizationId, status: "ACTIVE", deletedAt: null }, { $inc: { __v: 1 } }, { session });
        if (!site) throw new AppError("SITE_NOT_ACTIVE", "The issuing site must be active.", 409);
        const material = await Material.findOne({ _id: materialId, organizationId, status: "ACTIVE", deletedAt: null }).session(session);
        if (!material) throw new AppError("MATERIAL_NOT_ACTIVE", "The material must be active.", 409);
        if (!quantityFitsUnit(input.quantity, material.unit as MaterialUnit, true)) throw new AppError("INVALID_ISSUE_QUANTITY", "Quantity does not match the material unit.", 422);
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
        const consumptionId = new mongoose.Types.ObjectId();
        const issueNumber = `ISS-${new Date().getUTCFullYear()}-${consumptionId.toString().slice(-12).toUpperCase()}`;
        const allocations = result.allocations.map((allocation) => ({ ...allocation, transactionId: new mongoose.Types.ObjectId() }));
        await Consumption.create([{ _id: consumptionId, ...scope, issueNumber, quantity: stored(quantity), issuedAt: new Date(input.issuedAt), activity: input.activity, issuedTo: input.issuedTo, contractor: input.contractor ?? null, description: input.description ?? null, remarks: input.remarks ?? null, allocationMethod: input.allocationMethod, overrideReason: input.overrideReason ?? null, batchAllocations: allocations, stockBefore: balance.availableQuantity, stockAfter: stored(nextAvailable), valueRemoved: stored(result.valueRemoved), createdBy: actorUserId, status: "CONFIRMED" }], { session });
        await InventoryTransaction.create(allocations.map((allocation) => ({ _id: allocation.transactionId, ...scope, batchId: allocation.batchId, type: "CONSUMPTION", quantity: stored(new D(allocation.quantity.toString()).negated()), unitCost: allocation.unitCostSnapshot, referenceType: "CONSUMPTION", referenceId: consumptionId, performedBy: actorUserId })), { session, ordered: true });
        await recordAudit({ organizationId, actorUserId, action: "consumption.confirmed", entityType: "consumption", entityId: consumptionId.toString() }, session);
        const response: ConsumptionMutationResult = { id: consumptionId.toString(), issueNumber, status: "CONFIRMED" };
        await saveIdempotency(organizationId, key, "consumption.confirm", hash, response, session);
        return response;
      });
    } catch (error) {
      const committed = await previousResult(organizationId, key, "consumption.confirm", hash);
      if (committed) return committed;
      if (isDuplicateKey(error) && attempt < 2) continue;
      if (isDuplicateKey(error)) throw new AppError("CONSUMPTION_CONFLICT", "The issue conflicted with another request. Retry shortly.", 409);
      if (error instanceof Error && error.name === "VersionError") throw new AppError("INVENTORY_VERSION_CONFLICT", "Site stock changed. Reload and try again.", 409);
      throw error;
    }
  }
  throw new AppError("CONSUMPTION_CONFLICT", "The issue conflicted with another request. Retry shortly.", 409);
}

export async function reverseConsumption(identity: CurrentIdentity, consumptionId: string, reason: string, key: string): Promise<ConsumptionMutationResult> {
  requirePermission(identity, "inventory.adjust");
  if (!keyPattern.test(key)) throw new AppError("IDEMPOTENCY_KEY_REQUIRED", "Provide a valid Idempotency-Key header.", 400);
  await connectToDatabase();
  await ready();
  const organizationId = id(identity.context.organizationId);
  const actorUserId = id(identity.context.userId);
  const recordId = id(consumptionId);
  const scoped = await Consumption.findOne({ _id: recordId, organizationId }).select("siteId");
  if (!scoped) throw new AppError("CONSUMPTION_NOT_FOUND", "Material issue not found.", 404);
  requireSiteAccess(identity, scoped.siteId.toString());
  const hash = fingerprint({ consumptionId: recordId.toString(), reason });
  const replay = await previousResult(organizationId, key, "consumption.reverse", hash);
  if (replay) return replay;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await mongoose.connection.transaction(async (session) => {
        const record = await Consumption.findOne({ _id: recordId, organizationId }).session(session);
        if (!record || record.status !== "CONFIRMED") throw new AppError("CONSUMPTION_NOT_REVERSIBLE", "This issue is not eligible for reversal.", 409);
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
          await InventoryTransaction.create([{ ...scope, batchId: batch._id, type: "REVERSAL", quantity: allocation.quantity, unitCost: allocation.unitCostSnapshot, referenceType: "CONSUMPTION", referenceId: record._id, reversalOfTransactionId: allocation.transactionId, performedBy: actorUserId }], { session });
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
        await recordAudit({ organizationId, actorUserId, action: "consumption.reversed", entityType: "consumption", entityId: record._id.toString() }, session);
        const response: ConsumptionMutationResult = { id: record._id.toString(), issueNumber: record.issueNumber, status: "REVERSED" };
        await saveIdempotency(organizationId, key, "consumption.reverse", hash, response, session);
        return response;
      });
    } catch (error) {
      const committed = await previousResult(organizationId, key, "consumption.reverse", hash);
      if (committed) return committed;
      if (isDuplicateKey(error) && attempt < 2) continue;
      if (isDuplicateKey(error)) throw new AppError("CONSUMPTION_CONFLICT", "The reversal conflicted with another request. Retry shortly.", 409);
      throw error;
    }
  }
  throw new AppError("CONSUMPTION_CONFLICT", "The reversal conflicted with another request. Retry shortly.", 409);
}
