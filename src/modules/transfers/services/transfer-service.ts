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
import { Material } from "@/modules/materials/models/material";
import { quantityFitsUnit } from "@/modules/materials/schemas/catalogue";
import type { MaterialUnit } from "@/modules/materials/types";
import { Site } from "@/modules/sites/models/site";
import { hasOrganizationWideSiteAccess, requirePermission, requireSiteAccess } from "@/server/auth/authorize";
import { connectToDatabase } from "@/server/db/connect";
import { AppError } from "@/shared/errors/app-error";
import { Transfer } from "../models/transfer";
import type { CreateTransferInput, ListTransfersQuery, TransferStatus } from "../schemas/transfer";
import type { TransferMutationResult, TransferOptions, TransferView } from "../types";

const D = Decimal.clone({ precision: 80 });
const decimal = (value: string | number | Decimal) => mongoose.Types.Decimal128.fromString(new D(value).toString());
const amount = (value: mongoose.Types.Decimal128) => new D(value.toString());
const money = (value: Decimal) => value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
const maxMoney = new D(`${"9".repeat(32)}.99`);
const fixedMoney = (value: mongoose.Types.Decimal128) => amount(value).toFixed(2);
const oid = (value: string) => {
  if (!/^[a-fA-F0-9]{24}$/.test(value)) throw new AppError("TRANSFER_NOT_FOUND", "Transfer not found.", 404);
  return new mongoose.Types.ObjectId(value);
};
const keyPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;
const retentionMs = 7 * 24 * 60 * 60 * 1000;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const escaped = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
type TransferDocument = InstanceType<typeof Transfer>;
type Scope = { organizationId: mongoose.Types.ObjectId; siteId: mongoose.Types.ObjectId; materialId: mongoose.Types.ObjectId };

async function ready() {
  await Promise.all([Transfer.init(), InventoryBalance.init(), InventoryBatch.init(), InventoryTransaction.init(), IdempotencyKey.init(), ensureAuditReady()]);
}

function canSee(identity: CurrentIdentity, record: TransferDocument) {
  if (hasOrganizationWideSiteAccess(identity)) return true;
  return identity.context.assignedSiteIds.includes(record.sourceSiteId.toString()) || identity.context.assignedSiteIds.includes(record.destinationSiteId.toString());
}

async function views(organizationId: mongoose.Types.ObjectId, records: TransferDocument[]): Promise<TransferView[]> {
  if (!records.length) return [];
  const ids = (values: string[]) => [...new Set(values)].map(oid);
  const [sites, materials, users, batches] = await Promise.all([
    Site.find({ organizationId, _id: { $in: ids(records.flatMap((record) => [record.sourceSiteId.toString(), record.destinationSiteId.toString()])) } }).select("code name"),
    Material.find({ organizationId, _id: { $in: ids(records.map((record) => record.materialId.toString())) } }).select("code name unit"),
    User.find({ _id: { $in: ids(records.flatMap((record) => [record.requestedBy, record.approvedBy, record.dispatchedBy, record.receivedBy, record.closedBy].filter(Boolean).map(String))) } }).select("name"),
    InventoryBatch.find({ organizationId, _id: { $in: ids(records.flatMap((record) => record.allocations.map((entry) => entry.batchId.toString()))) } }).select("batchCode"),
  ]);
  const siteMap = new Map(sites.map((site) => [site._id.toString(), site]));
  const materialMap = new Map(materials.map((material) => [material._id.toString(), material]));
  const userMap = new Map(users.map((user) => [user._id.toString(), user.name]));
  const batchMap = new Map(batches.map((batch) => [batch._id.toString(), batch.batchCode]));
  const actor = (value: mongoose.Types.ObjectId | null | undefined) => value ? { id: value.toString(), name: userMap.get(value.toString()) ?? "Former member" } : null;
  return records.map((record) => {
    const source = siteMap.get(record.sourceSiteId.toString());
    const destination = siteMap.get(record.destinationSiteId.toString());
    const material = materialMap.get(record.materialId.toString());
    if (!source || !destination || !material) throw new AppError("TRANSFER_REFERENCE_MISSING", "Transfer references are unavailable.", 500);
    const site = (value: typeof source) => ({ id: value._id.toString(), code: value.code, name: value.name });
    return {
      id: record._id.toString(), transferNumber: record.transferNumber, status: record.status as TransferStatus,
      sourceSite: site(source), destinationSite: site(destination),
      material: { id: material._id.toString(), code: material.code, name: material.name, unit: material.unit as MaterialUnit },
      quantity: record.quantity.toString(), targetDate: record.targetDate?.toISOString().slice(0, 10) ?? null,
      reason: record.reason, purpose: record.purpose, notes: record.notes ?? null,
      createdAt: record.createdAt.toISOString(), requestedBy: actor(record.requestedBy)!, requestedAt: record.requestedAt.toISOString(),
      approvedBy: actor(record.approvedBy), approvedAt: record.approvedAt?.toISOString() ?? null,
      dispatchedBy: actor(record.dispatchedBy), dispatchedAt: record.dispatchedAt?.toISOString() ?? null,
      receivedBy: actor(record.receivedBy), receivedAt: record.receivedAt?.toISOString() ?? null,
      closedBy: actor(record.closedBy), closedAt: record.closedAt?.toISOString() ?? null, closureReason: record.closureReason ?? null,
      inTransitQuantity: record.inTransitQuantity.toString(), inTransitValue: fixedMoney(record.inTransitValue), transferValue: fixedMoney(record.transferValue),
      receiptValue: fixedMoney(record.receiptValue), roundingVariance: amount(record.roundingVariance).toFixed(2),
      allocations: record.allocations.map((entry) => ({
        batchId: entry.batchId.toString(), batchCode: batchMap.get(entry.batchId.toString()) ?? "Former batch",
        destinationBatchId: entry.destinationBatchId?.toString() ?? null, quantity: entry.quantity.toString(),
        unitCost: amount(entry.unitCostSnapshot).toFixed(2), value: fixedMoney(entry.valueRemoved),
      })),
    };
  });
}

export async function listTransfers(identity: CurrentIdentity, query: ListTransfersQuery) {
  requirePermission(identity, "inventory.view");
  // Visibility is still constrained to assigned sites below. Filtering a visible
  // source transfer by its destination does not require destination assignment.
  await connectToDatabase();
  const organizationId = oid(identity.context.organizationId);
  const allowed = hasOrganizationWideSiteAccess(identity) ? null : identity.context.assignedSiteIds.map(oid);
  const filter = {
    organizationId,
    ...(allowed ? { $or: [{ sourceSiteId: { $in: allowed } }, { destinationSiteId: { $in: allowed } }] } : {}),
    ...(query.sourceSiteId ? { sourceSiteId: oid(query.sourceSiteId) } : {}),
    ...(query.destinationSiteId ? { destinationSiteId: oid(query.destinationSiteId) } : {}),
    ...(query.materialId ? { materialId: oid(query.materialId) } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.q ? { transferNumber: { $regex: escaped(query.q), $options: "i" } } : {}),
    ...(query.cursor ? { _id: { $lt: oid(query.cursor) } } : {}),
  };
  const records = await Transfer.find(filter).sort({ _id: -1 }).limit(query.limit + 1);
  const hasMore = records.length > query.limit;
  const page = records.slice(0, query.limit);
  const summaryFilter = { ...filter };
  Reflect.deleteProperty(summaryFilter, "_id");
  Reflect.deleteProperty(summaryFilter, "status");
  const summary = await Transfer.aggregate<{ _id: TransferStatus; count: number; inTransitValue: mongoose.Types.Decimal128 }>([
    { $match: summaryFilter },
    { $group: { _id: "$status", count: { $sum: 1 }, inTransitValue: { $sum: "$inTransitValue" } } },
  ]);
  return { transfers: await views(organizationId, page), pagination: { nextCursor: hasMore ? page.at(-1)?._id.toString() ?? null : null, hasMore, limit: query.limit },
    summary: { counts: Object.fromEntries(summary.map((row) => [row._id, row.count])), inTransitValue: summary.find((row) => row._id === "DISPATCHED")?.inTransitValue?.toString() ?? "0" } };
}

export async function getTransfer(identity: CurrentIdentity, transferId: string): Promise<TransferView> {
  requirePermission(identity, "inventory.view");
  await connectToDatabase();
  const organizationId = oid(identity.context.organizationId);
  const record = await Transfer.findOne({ _id: oid(transferId), organizationId });
  if (!record || !canSee(identity, record)) throw new AppError("TRANSFER_NOT_FOUND", "Transfer not found.", 404);
  return (await views(organizationId, [record]))[0];
}

export async function getTransferOptions(identity: CurrentIdentity, sourceSiteId?: string, materialId?: string): Promise<TransferOptions> {
  requirePermission(identity, "inventory.view");
  if (sourceSiteId) requireSiteAccess(identity, sourceSiteId);
  if (materialId && !sourceSiteId) throw new AppError("VALIDATION_ERROR", "Choose a source site first.", 422);
  await connectToDatabase();
  const organizationId = oid(identity.context.organizationId);
  const allowed = hasOrganizationWideSiteAccess(identity) ? null : identity.context.assignedSiteIds.map(oid);
  const [sources, destinations, materials] = await Promise.all([
    Site.find({ organizationId, status: "ACTIVE", deletedAt: null, ...(allowed ? { _id: { $in: allowed } } : {}) }).select("code name").sort({ name: 1 }),
    Site.find({ organizationId, status: "ACTIVE", deletedAt: null }).select("code name").sort({ name: 1 }),
    Material.find({ organizationId, status: "ACTIVE", deletedAt: null }).select("code name unit").sort({ name: 1 }),
  ]);
  if (sourceSiteId && !sources.some((site) => site._id.toString() === sourceSiteId.toLowerCase())) throw new AppError("SITE_NOT_FOUND", "Choose an active source site.", 404);
  if (materialId && !materials.some((material) => material._id.toString() === materialId.toLowerCase())) throw new AppError("MATERIAL_NOT_FOUND", "Choose an active material.", 404);
  const scope = materialId ? { organizationId, siteId: oid(sourceSiteId!), materialId: oid(materialId) } : null;
  const [balance, batches] = scope ? await Promise.all([InventoryBalance.findOne(scope), InventoryBatch.find({ ...scope, status: "ACTIVE" }).sort({ receivedAt: 1, _id: 1 })]) : [null, []];
  return {
    sourceSites: sources.map((site) => ({ id: site._id.toString(), code: site.code, name: site.name })),
    destinationSites: destinations.map((site) => ({ id: site._id.toString(), code: site.code, name: site.name })),
    materials: materials.map((material) => ({ id: material._id.toString(), code: material.code, name: material.name, unit: material.unit as MaterialUnit })),
    stock: balance ? { onHand: balance.onHandQuantity.toString(), reserved: balance.reservedQuantity.toString(), available: balance.availableQuantity.toString(), version: balance.version } : null,
    batches: batches.map((batch) => ({ id: batch._id.toString(), batchCode: batch.batchCode, receivedAt: batch.receivedAt.toISOString(), remaining: batch.remainingQuantity.toString(), available: amount(batch.remainingQuantity).minus(amount(batch.reservedQuantity)).toString(), unitCost: amount(batch.unitCost).toFixed(2) })).filter((batch) => new D(batch.available).gt(0)),
  };
}

async function previous(organizationId: mongoose.Types.ObjectId, key: string, operation: string, requestHash: string): Promise<TransferMutationResult | null> {
  const record = await IdempotencyKey.findOne({ organizationId, key });
  if (!record) return null;
  if (record.operation !== operation || record.requestHash !== requestHash) throw new AppError("IDEMPOTENCY_KEY_REUSED", "This idempotency key was already used with a different request.", 409);
  return record.responseBody as TransferMutationResult;
}
async function saveKey(organizationId: mongoose.Types.ObjectId, key: string, operation: string, requestHash: string, result: TransferMutationResult, session: mongoose.ClientSession) {
  await IdempotencyKey.create([{ organizationId, key, operation, requestHash, responseStatus: operation === "transfer.request" ? 201 : 200, resourceId: oid(result.id), responseBody: result, expiresAt: new Date(Date.now() + retentionMs) }], { session });
}
async function mutation(identity: CurrentIdentity, key: string, operation: string, payload: unknown, work: (session: mongoose.ClientSession) => Promise<TransferMutationResult>) {
  if (!keyPattern.test(key)) throw new AppError("IDEMPOTENCY_KEY_REQUIRED", "Provide a valid Idempotency-Key header.", 400);
  await connectToDatabase(); await ready();
  const organizationId = oid(identity.context.organizationId);
  const requestHash = hash(payload);
  const replay = await previous(organizationId, key, operation, requestHash);
  if (replay) return replay;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await mongoose.connection.transaction(async (session) => {
        const result = await work(session);
        await saveKey(organizationId, key, operation, requestHash, result, session);
        return result;
      });
    } catch (error) {
      const committed = await previous(organizationId, key, operation, requestHash);
      if (committed) return committed;
      if (isDuplicateKey(error) && attempt < 2) continue;
      if (isDuplicateKey(error) || (error instanceof Error && error.name === "VersionError")) throw new AppError("TRANSFER_CONFLICT", "Transfer or stock changed. Reload and try again.", 409);
      throw error;
    }
  }
  throw new AppError("TRANSFER_CONFLICT", "Transfer or stock changed. Reload and try again.", 409);
}

async function lockSite(organizationId: mongoose.Types.ObjectId, siteId: mongoose.Types.ObjectId, session: mongoose.ClientSession) {
  const site = await Site.findOneAndUpdate({ _id: siteId, organizationId, status: "ACTIVE", deletedAt: null }, { $inc: { __v: 1 } }, { session });
  if (!site) throw new AppError("SITE_NOT_ACTIVE", "Both transfer sites must be active.", 409);
}
async function lockMaterial(organizationId: mongoose.Types.ObjectId, materialId: mongoose.Types.ObjectId, session: mongoose.ClientSession) {
  const material = await Material.findOne({ _id: materialId, organizationId, status: "ACTIVE", deletedAt: null }).session(session);
  if (!material) throw new AppError("MATERIAL_NOT_ACTIVE", "The material must be active.", 409);
  const updated = await Material.updateOne({ _id: materialId, organizationId, unit: material.unit, __v: material.__v }, { $inc: { __v: 1 } }, { session });
  if (updated.matchedCount !== 1) throw new AppError("MATERIAL_CHANGED", "Material changed. Reload and try again.", 409);
  return material;
}
async function ledger(scope: Scope, transferId: mongoose.Types.ObjectId, actorUserId: mongoose.Types.ObjectId, type: "TRANSFER_RESERVE" | "TRANSFER_RESERVE_RELEASE" | "TRANSFER_OUT" | "TRANSFER_IN", batchId: mongoose.Types.ObjectId, quantity: Decimal, unitCost: mongoose.Types.Decimal128, session: mongoose.ClientSession) {
  await InventoryTransaction.create([{ ...scope, batchId, type, quantity: decimal(quantity), unitCost, referenceType: "TRANSFER", referenceId: transferId, performedBy: actorUserId }], { session });
}
async function updateBalance(scope: Scope, balance: InstanceType<typeof InventoryBalance>, next: { onHand: Decimal; reserved: Decimal; available: Decimal; value: Decimal }, session: mongoose.ClientSession) {
  if (next.onHand.lt(0) || next.reserved.lt(0) || next.available.lt(0) || next.value.lt(0) || next.value.gt(maxMoney) || !next.onHand.eq(next.reserved.plus(next.available))) {
    throw new AppError("INVENTORY_VALUE_CONFLICT", "Stock balance would become inconsistent.", 409);
  }
  const result = await InventoryBalance.updateOne({ _id: balance._id, ...scope, version: balance.version }, { $set: { onHandQuantity: decimal(next.onHand), reservedQuantity: decimal(next.reserved), availableQuantity: decimal(next.available), inventoryValue: decimal(next.value) }, $inc: { version: 1 } }, { session });
  if (result.matchedCount !== 1) throw new AppError("INVENTORY_VERSION_CONFLICT", "Site stock changed. Reload and try again.", 409);
}
async function lockedTransfer(identity: CurrentIdentity, transferId: string, expected: TransferStatus, session: mongoose.ClientSession) {
  const organizationId = oid(identity.context.organizationId);
  const record = await Transfer.findOneAndUpdate({ _id: oid(transferId), organizationId, status: expected }, { $inc: { __v: 1 } }, { session });
  if (!record) throw new AppError("TRANSFER_STATE_CONFLICT", `Transfer must be ${expected.toLowerCase()} for this action.`, 409);
  if (!canSee(identity, record)) throw new AppError("TRANSFER_NOT_FOUND", "Transfer not found.", 404);
  return record;
}

export async function requestTransfer(identity: CurrentIdentity, input: CreateTransferInput, key: string) {
  requirePermission(identity, "transfer.request"); requireSiteAccess(identity, input.sourceSiteId);
  if (input.sourceSiteId.toLowerCase() === input.destinationSiteId.toLowerCase()) throw new AppError("INVALID_TRANSFER_ROUTE", "Choose two different sites.", 422);
  return mutation(identity, key, "transfer.request", input, async (session) => {
    const organizationId = oid(identity.context.organizationId);
    const sourceSiteId = oid(input.sourceSiteId), destinationSiteId = oid(input.destinationSiteId), materialId = oid(input.materialId);
    await lockSite(organizationId, sourceSiteId, session); await lockSite(organizationId, destinationSiteId, session);
    const material = await lockMaterial(organizationId, materialId, session);
    if (!quantityFitsUnit(input.quantity, material.unit as MaterialUnit, true)) throw new AppError("INVALID_TRANSFER_QUANTITY", "Quantity does not match the material unit.", 422);
    const id = new mongoose.Types.ObjectId();
    const transferNumber = `TRF-${new Date().getUTCFullYear()}-${id.toString().slice(-12).toUpperCase()}`;
    await Transfer.create([{ _id: id, organizationId, sourceSiteId, destinationSiteId, materialId, transferNumber, quantity: decimal(input.quantity), targetDate: input.targetDate ? new Date(`${input.targetDate}T00:00:00.000Z`) : null, reason: input.reason, purpose: input.purpose ?? input.reason, notes: input.remarks ?? input.notes ?? null, requestedBy: oid(identity.context.userId), requestedAt: new Date() }], { session });
    await recordAudit({ organizationId, actorUserId: oid(identity.context.userId), action: "transfer.requested", entityType: "transfer", entityId: id.toString() }, session);
    return { id: id.toString(), transferNumber, status: "REQUESTED" as const };
  });
}

export async function approveTransfer(identity: CurrentIdentity, transferId: string, key: string) {
  requirePermission(identity, "transfer.approve");
  await getTransfer(identity, transferId);
  return mutation(identity, key, "transfer.approve", { transferId }, async (session) => {
    const record = await lockedTransfer(identity, transferId, "REQUESTED", session);
    const organizationId = record.organizationId, actorUserId = oid(identity.context.userId);
    await lockSite(organizationId, record.sourceSiteId, session); await lockSite(organizationId, record.destinationSiteId, session);
    const material = await lockMaterial(organizationId, record.materialId, session);
    if (!quantityFitsUnit(record.quantity.toString(), material.unit as MaterialUnit, true)) throw new AppError("INVALID_TRANSFER_QUANTITY", "Quantity does not match the material unit.", 422);
    const scope = { organizationId, siteId: record.sourceSiteId, materialId: record.materialId };
    const balance = await InventoryBalance.findOne(scope).session(session);
    const quantity = amount(record.quantity);
    if (!balance || amount(balance.availableQuantity).lt(quantity)) throw new AppError("INSUFFICIENT_STOCK", "Source stock is no longer sufficient to approve this transfer.", 409);
    const batches = await InventoryBatch.find({ ...scope, status: "ACTIVE" }).sort({ receivedAt: 1, _id: 1 }).session(session);
    let needed = quantity;
    const allocations: Array<{ batchId: mongoose.Types.ObjectId; quantity: mongoose.Types.Decimal128; unitCostSnapshot: mongoose.Types.Decimal128; valueRemoved: mongoose.Types.Decimal128 }> = [];
    for (const batch of batches) {
      if (needed.isZero()) break;
      const free = amount(batch.remainingQuantity).minus(amount(batch.reservedQuantity));
      if (free.lte(0)) continue;
      const reserved = D.min(free, needed);
      const result = await InventoryBatch.updateOne({ _id: batch._id, ...scope, version: batch.version, remainingQuantity: batch.remainingQuantity, reservedQuantity: batch.reservedQuantity }, { $set: { reservedQuantity: decimal(amount(batch.reservedQuantity).plus(reserved)) }, $inc: { version: 1 } }, { session });
      if (result.matchedCount !== 1) throw new AppError("INVENTORY_VERSION_CONFLICT", "Source batch changed. Reload and try again.", 409);
      allocations.push({ batchId: batch._id, quantity: decimal(reserved), unitCostSnapshot: batch.unitCost, valueRemoved: decimal(0) });
      await ledger(scope, record._id, actorUserId, "TRANSFER_RESERVE", batch._id, reserved, batch.unitCost, session);
      needed = needed.minus(reserved);
    }
    if (!needed.isZero()) throw new AppError("INSUFFICIENT_STOCK", "Source FIFO batches cannot cover this transfer.", 409);
    await updateBalance(scope, balance, { onHand: amount(balance.onHandQuantity), reserved: amount(balance.reservedQuantity).plus(quantity), available: amount(balance.availableQuantity).minus(quantity), value: amount(balance.inventoryValue) }, session);
    await Transfer.updateOne({ _id: record._id, organizationId, status: "REQUESTED" }, { $set: { status: "APPROVED", allocations, approvedBy: actorUserId, approvedAt: new Date() } }, { session });
    await recordAudit({ organizationId, actorUserId, action: "transfer.approved", entityType: "transfer", entityId: record._id.toString() }, session);
    return { id: record._id.toString(), transferNumber: record.transferNumber, status: "APPROVED" as const };
  });
}

export async function dispatchTransfer(identity: CurrentIdentity, transferId: string, key: string) {
  requirePermission(identity, "transfer.dispatch");
  const visible = await getTransfer(identity, transferId);
  requireSiteAccess(identity, visible.sourceSite.id);
  return mutation(identity, key, "transfer.dispatch", { transferId }, async (session) => {
    const record = await lockedTransfer(identity, transferId, "APPROVED", session);
    requireSiteAccess(identity, record.sourceSiteId.toString());
    const organizationId = record.organizationId, actorUserId = oid(identity.context.userId);
    await lockSite(organizationId, record.sourceSiteId, session); await lockSite(organizationId, record.destinationSiteId, session);
    const scope = { organizationId, siteId: record.sourceSiteId, materialId: record.materialId };
    const balance = await InventoryBalance.findOne(scope).session(session);
    const quantity = amount(record.quantity);
    if (!balance || amount(balance.reservedQuantity).lt(quantity) || amount(balance.onHandQuantity).lt(quantity)) throw new AppError("INVENTORY_VALUE_CONFLICT", "Reserved source stock is inconsistent.", 409);
    let total = new D(0);
    const allocations = [];
    for (const allocation of record.allocations) {
      const batch = await InventoryBatch.findOne({ _id: allocation.batchId, ...scope, status: "ACTIVE" }).session(session);
      const part = amount(allocation.quantity);
      if (!batch || amount(batch.reservedQuantity).lt(part) || amount(batch.remainingQuantity).lt(part)) throw new AppError("INVENTORY_VALUE_CONFLICT", "A reserved source batch is unavailable.", 409);
      const after = amount(batch.remainingQuantity).minus(part);
      const value = money(amount(batch.remainingQuantity).times(amount(batch.unitCost))).minus(money(after.times(amount(batch.unitCost))));
      const result = await InventoryBatch.updateOne({ _id: batch._id, ...scope, version: batch.version, remainingQuantity: batch.remainingQuantity, reservedQuantity: batch.reservedQuantity }, { $set: { remainingQuantity: decimal(after), reservedQuantity: decimal(amount(batch.reservedQuantity).minus(part)), status: after.isZero() ? "DEPLETED" : "ACTIVE" }, $inc: { version: 1 } }, { session });
      if (result.matchedCount !== 1) throw new AppError("INVENTORY_VERSION_CONFLICT", "Source batch changed. Reload and try again.", 409);
      await ledger(scope, record._id, actorUserId, "TRANSFER_RESERVE_RELEASE", batch._id, part.negated(), batch.unitCost, session);
      await ledger(scope, record._id, actorUserId, "TRANSFER_OUT", batch._id, part.negated(), batch.unitCost, session);
      allocations.push({ batchId: batch._id, quantity: allocation.quantity, unitCostSnapshot: batch.unitCost, valueRemoved: decimal(value) });
      total = total.plus(value);
    }
    if (!allocations.length || !allocations.reduce((sum, entry) => sum.plus(entry.quantity.toString()), new D(0)).eq(quantity)) throw new AppError("INVENTORY_VALUE_CONFLICT", "Transfer allocations are incomplete.", 409);
    await updateBalance(scope, balance, { onHand: amount(balance.onHandQuantity).minus(quantity), reserved: amount(balance.reservedQuantity).minus(quantity), available: amount(balance.availableQuantity), value: amount(balance.inventoryValue).minus(total) }, session);
    await Transfer.updateOne({ _id: record._id, organizationId, status: "APPROVED" }, { $set: { status: "DISPATCHED", allocations, dispatchedBy: actorUserId, dispatchedAt: new Date(), inTransitQuantity: record.quantity, inTransitValue: decimal(total), transferValue: decimal(total) } }, { session });
    await recordAudit({ organizationId, actorUserId, action: "transfer.dispatched", entityType: "transfer", entityId: record._id.toString() }, session);
    return { id: record._id.toString(), transferNumber: record.transferNumber, status: "DISPATCHED" as const };
  });
}

export async function receiveTransfer(identity: CurrentIdentity, transferId: string, key: string) {
  requirePermission(identity, "transfer.receive");
  const visible = await getTransfer(identity, transferId);
  requireSiteAccess(identity, visible.destinationSite.id);
  return mutation(identity, key, "transfer.receive", { transferId }, async (session) => {
    const record = await lockedTransfer(identity, transferId, "DISPATCHED", session);
    requireSiteAccess(identity, record.destinationSiteId.toString());
    const organizationId = record.organizationId, actorUserId = oid(identity.context.userId);
    await lockSite(organizationId, record.destinationSiteId, session);
    const scope = { organizationId, siteId: record.destinationSiteId, materialId: record.materialId };
    const balance = await InventoryBalance.findOneAndUpdate(scope, { $setOnInsert: { ...scope, onHandQuantity: decimal(0), reservedQuantity: decimal(0), availableQuantity: decimal(0), inventoryValue: decimal(0), version: 0 } }, { upsert: true, returnDocument: "after", session });
    if (!balance) throw new AppError("INVENTORY_VALUE_CONFLICT", "Destination balance could not be created.", 409);
    const allocations = [];
    let total = new D(0);
    let receiptValue = new D(0);
    for (const allocation of record.allocations) {
      const batchId = new mongoose.Types.ObjectId();
      const part = amount(allocation.quantity);
      const value = amount(allocation.valueRemoved);
      const cost = allocation.unitCostSnapshot;
      const destinationValue = money(part.times(amount(cost)));
      await InventoryBatch.create([{ _id: batchId, ...scope, batchCode: `TRF-${record._id.toString().toUpperCase()}-${allocation.batchId.toString().toUpperCase()}`, sourceTransferId: record._id, sourceBatchId: allocation.batchId, receivedAt: new Date(), initialQuantity: allocation.quantity, remainingQuantity: allocation.quantity, unitCost: cost, status: "ACTIVE" }], { session });
      await ledger(scope, record._id, actorUserId, "TRANSFER_IN", batchId, part, cost, session);
      allocations.push({ batchId: allocation.batchId, destinationBatchId: batchId, quantity: allocation.quantity, unitCostSnapshot: allocation.unitCostSnapshot, valueRemoved: allocation.valueRemoved });
      total = total.plus(value);
      receiptValue = receiptValue.plus(destinationValue);
    }
    if (!allocations.length || !total.eq(amount(record.inTransitValue)) || !amount(record.inTransitQuantity).eq(amount(record.quantity))) throw new AppError("INVENTORY_VALUE_CONFLICT", "In-transit stock is inconsistent.", 409);
    await updateBalance(scope, balance, { onHand: amount(balance.onHandQuantity).plus(amount(record.quantity)), reserved: amount(balance.reservedQuantity), available: amount(balance.availableQuantity).plus(amount(record.quantity)), value: amount(balance.inventoryValue).plus(receiptValue) }, session);
    await Transfer.updateOne({ _id: record._id, organizationId, status: "DISPATCHED" }, { $set: { status: "RECEIVED", allocations, receivedBy: actorUserId, receivedAt: new Date(), inTransitQuantity: decimal(0), inTransitValue: decimal(0), receiptValue: decimal(receiptValue), roundingVariance: decimal(receiptValue.minus(total)) } }, { session });
    await recordAudit({ organizationId, actorUserId, action: "transfer.received", entityType: "transfer", entityId: record._id.toString() }, session);
    return { id: record._id.toString(), transferNumber: record.transferNumber, status: "RECEIVED" as const };
  });
}

export async function closeTransfer(identity: CurrentIdentity, transferId: string, action: "reject" | "cancel", reason: string, key: string) {
  if (action === "reject") requirePermission(identity, "transfer.approve");
  else requirePermission(identity, "transfer.request");
  const visible = await getTransfer(identity, transferId);
  if (action === "cancel" && visible.status === "APPROVED") requirePermission(identity, "transfer.approve");
  if (action === "cancel" && visible.status === "REQUESTED" && visible.requestedBy.id !== identity.context.userId && !identity.membership.permissions.includes("transfer.approve")) throw new AppError("FORBIDDEN", "Only the requester or an approver can cancel this request.", 403);
  return mutation(identity, key, `transfer.${action}`, { transferId, reason }, async (session) => {
    const organizationId = oid(identity.context.organizationId), actorUserId = oid(identity.context.userId);
    const record = await Transfer.findOneAndUpdate({ _id: oid(transferId), organizationId, status: { $in: action === "reject" ? ["REQUESTED"] : ["REQUESTED", "APPROVED"] } }, { $inc: { __v: 1 } }, { session });
    if (!record) throw new AppError("TRANSFER_STATE_CONFLICT", "This transfer cannot be closed in its current state.", 409);
    if (!canSee(identity, record)) throw new AppError("TRANSFER_NOT_FOUND", "Transfer not found.", 404);
    if (action === "cancel" && record.status === "REQUESTED" && record.requestedBy.toString() !== identity.context.userId && !identity.membership.permissions.includes("transfer.approve")) throw new AppError("FORBIDDEN", "Only the requester or an approver can cancel this request.", 403);
    if (action === "cancel" && record.status === "APPROVED") requirePermission(identity, "transfer.approve");
    if (record.status === "APPROVED") {
      await lockSite(organizationId, record.sourceSiteId, session);
      const scope = { organizationId, siteId: record.sourceSiteId, materialId: record.materialId };
      const balance = await InventoryBalance.findOne(scope).session(session);
      if (!balance || amount(balance.reservedQuantity).lt(amount(record.quantity))) throw new AppError("INVENTORY_VALUE_CONFLICT", "Reserved stock is inconsistent.", 409);
      for (const allocation of record.allocations) {
        const batch = await InventoryBatch.findOne({ _id: allocation.batchId, ...scope }).session(session);
        const part = amount(allocation.quantity);
        if (!batch || amount(batch.reservedQuantity).lt(part)) throw new AppError("INVENTORY_VALUE_CONFLICT", "Reserved batch is inconsistent.", 409);
        const result = await InventoryBatch.updateOne({ _id: batch._id, ...scope, version: batch.version, reservedQuantity: batch.reservedQuantity }, { $set: { reservedQuantity: decimal(amount(batch.reservedQuantity).minus(part)) }, $inc: { version: 1 } }, { session });
        if (result.matchedCount !== 1) throw new AppError("INVENTORY_VERSION_CONFLICT", "Source batch changed. Reload and try again.", 409);
        await ledger(scope, record._id, actorUserId, "TRANSFER_RESERVE_RELEASE", batch._id, part.negated(), batch.unitCost, session);
      }
      await updateBalance(scope, balance, { onHand: amount(balance.onHandQuantity), reserved: amount(balance.reservedQuantity).minus(amount(record.quantity)), available: amount(balance.availableQuantity).plus(amount(record.quantity)), value: amount(balance.inventoryValue) }, session);
    }
    const status = action === "reject" ? "REJECTED" : "CANCELLED";
    await Transfer.updateOne({ _id: record._id, organizationId, status: record.status }, { $set: { status, closedBy: actorUserId, closedAt: new Date(), closureReason: reason } }, { session });
    await recordAudit({ organizationId, actorUserId, action: `transfer.${status.toLowerCase()}`, entityType: "transfer", entityId: record._id.toString() }, session);
    return { id: record._id.toString(), transferNumber: record.transferNumber, status };
  });
}
