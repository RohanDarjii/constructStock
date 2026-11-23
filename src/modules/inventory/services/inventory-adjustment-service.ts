import "server-only";
import { createHash } from "node:crypto";
import Decimal from "decimal.js";
import mongoose from "mongoose";
import { ensureAuditReady, recordAudit } from "@/modules/audit/services/record-audit";
import type { CurrentIdentity } from "@/modules/auth/services/auth-service";
import { isDuplicateKey } from "@/modules/auth/services/security";
import { Material } from "@/modules/materials/models/material";
import { quantityFitsUnit } from "@/modules/materials/schemas/catalogue";
import type { MaterialUnit } from "@/modules/materials/types";
import { Site } from "@/modules/sites/models/site";
import { requirePermission } from "@/server/auth/authorize";
import { connectToDatabase } from "@/server/db/connect";
import { AppError } from "@/shared/errors/app-error";
import { IdempotencyKey } from "../models/idempotency-key";
import { InventoryAdjustment } from "../models/inventory-adjustment";
import { InventoryBalance } from "../models/inventory-balance";
import { InventoryBatch } from "../models/inventory-batch";
import { InventoryTransaction } from "../models/inventory-transaction";
import type { AdjustmentInput } from "../schemas/inventory";
import type { AdjustmentView } from "../types";

const zero = new Decimal(0);
const idempotencyRetentionMs = 7 * 24 * 60 * 60 * 1000;

function id(value: string) { return new mongoose.Types.ObjectId(value); }
function stored(value: Decimal | string) { return mongoose.Types.Decimal128.fromString(new Decimal(value).toString()); }
// The purchasing milestone will finalize the organization-wide monetary rounding policy.
function money(value: Decimal) { return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP); }

function hashRequest(input: AdjustmentInput) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

async function previousResult(organizationId: mongoose.Types.ObjectId, key: string, requestHash: string): Promise<AdjustmentView | null> {
  const previous = await IdempotencyKey.findOne({ organizationId, key });
  if (!previous) return null;
  if (previous.operation !== "inventory.adjustment" || previous.requestHash !== requestHash) {
    throw new AppError("IDEMPOTENCY_KEY_REUSED", "This idempotency key was already used with a different request.", 409);
  }
  return previous.responseBody as AdjustmentView;
}

function view(adjustment: InstanceType<typeof InventoryAdjustment>): AdjustmentView {
  return { id: adjustment._id.toString(), siteId: adjustment.siteId.toString(), materialId: adjustment.materialId.toString(), direction: adjustment.direction as "IN" | "OUT", quantity: adjustment.quantity.toString(), reasonCode: adjustment.reasonCode, remarks: adjustment.remarks, batchIds: adjustment.batchAllocations.map((allocation) => allocation.batchId.toString()), createdAt: adjustment.createdAt.toISOString() };
}

async function updateBalance(scope: { organizationId: mongoose.Types.ObjectId; siteId: mongoose.Types.ObjectId; materialId: mongoose.Types.ObjectId }, deltaQuantity: Decimal, deltaValue: Decimal, session: mongoose.ClientSession) {
  const balance = await InventoryBalance.findOne(scope).session(session);
  if (!balance) {
    if (deltaQuantity.lte(0)) throw new AppError("INSUFFICIENT_STOCK", "No stock is available at this site.", 409);
    const [created] = await InventoryBalance.create([{ ...scope, onHandQuantity: stored(deltaQuantity), reservedQuantity: stored(zero), availableQuantity: stored(deltaQuantity), inventoryValue: stored(deltaValue), version: 1 }], { session });
    return created;
  }
  const onHand = new Decimal(balance.onHandQuantity.toString()).plus(deltaQuantity);
  const available = new Decimal(balance.availableQuantity.toString()).plus(deltaQuantity);
  const value = new Decimal(balance.inventoryValue.toString()).plus(deltaValue);
  if (onHand.lt(0) || available.lt(0)) throw new AppError("INSUFFICIENT_STOCK", "Available stock is insufficient.", 409);
  if (value.lt(0)) throw new AppError("INVENTORY_VALUE_CONFLICT", "Inventory value is inconsistent with its batches.", 409);
  const result = await InventoryBalance.updateOne({ ...scope, _id: balance._id, version: balance.version, availableQuantity: { $gte: stored(deltaQuantity.negated()) } }, {
    $set: { onHandQuantity: stored(onHand), availableQuantity: stored(available), inventoryValue: stored(value) }, $inc: { version: 1 },
  }, { session });
  if (result.matchedCount !== 1) throw new AppError("INVENTORY_VERSION_CONFLICT", "Inventory changed. Reload and try again.", 409);
  return balance;
}

async function lockMaterial(material: InstanceType<typeof Material>, organizationId: mongoose.Types.ObjectId, session: mongoose.ClientSession) {
  const locked = await Material.updateOne(
    { _id: material._id, organizationId, status: "ACTIVE", deletedAt: null, unit: material.unit, __v: material.__v },
    { ...(material.unitLockedAt ? {} : { $set: { unitLockedAt: new Date() } }), $inc: { __v: 1 } },
    { session },
  );
  if (locked.matchedCount !== 1) throw new AppError("MATERIAL_CHANGED", "Material details changed. Reload and try again.", 409);
}

async function lockSite(site: InstanceType<typeof Site>, organizationId: mongoose.Types.ObjectId, session: mongoose.ClientSession) {
  const locked = await Site.updateOne(
    { _id: site._id, organizationId, status: "ACTIVE", deletedAt: null, __v: site.__v },
    { $inc: { __v: 1 } },
    { session },
  );
  if (locked.matchedCount !== 1) throw new AppError("SITE_CHANGED", "Site details changed. Reload and try again.", 409);
}

async function allocateOut(scope: { organizationId: mongoose.Types.ObjectId; siteId: mongoose.Types.ObjectId; materialId: mongoose.Types.ObjectId }, input: AdjustmentInput, session: mongoose.ClientSession) {
  const candidates = await InventoryBatch.find({ ...scope, ...(input.batchId ? { _id: id(input.batchId) } : {}), status: "ACTIVE", remainingQuantity: { $gt: stored(zero) } }).sort({ receivedAt: 1, _id: 1 }).session(session);
  let needed = new Decimal(input.quantity);
  let valueRemoved = zero;
  const allocations: Array<{ batchId: mongoose.Types.ObjectId; quantity: mongoose.Types.Decimal128; unitCostSnapshot: mongoose.Types.Decimal128 }> = [];
  for (const batch of candidates) {
    const remaining = new Decimal(batch.remainingQuantity.toString());
    const reserved = new Decimal(batch.reservedQuantity.toString());
    const available = remaining.minus(reserved);
    if (available.lte(0)) continue;
    const taken = Decimal.min(needed, available);
    const after = remaining.minus(taken);
    const cost = new Decimal(batch.unitCost.toString());
    const oldValue = money(remaining.times(cost));
    const newValue = money(after.times(cost));
    const result = await InventoryBatch.updateOne({ _id: batch._id, ...scope, version: batch.version, status: "ACTIVE", remainingQuantity: batch.remainingQuantity, reservedQuantity: batch.reservedQuantity }, {
      $set: { remainingQuantity: stored(after), status: after.isZero() ? "DEPLETED" : "ACTIVE" }, $inc: { version: 1 },
    }, { session });
    if (result.matchedCount !== 1) throw new AppError("INVENTORY_VERSION_CONFLICT", "A batch changed. Reload and try again.", 409);
    valueRemoved = valueRemoved.plus(oldValue.minus(newValue));
    allocations.push({ batchId: batch._id, quantity: stored(taken), unitCostSnapshot: batch.unitCost });
    needed = needed.minus(taken);
    if (needed.isZero()) break;
  }
  if (needed.gt(0)) throw new AppError("INSUFFICIENT_STOCK", "Available batch stock is insufficient.", 409);
  return { allocations, valueRemoved };
}

export async function listAdjustmentOptions(identity: CurrentIdentity) {
  requirePermission(identity, "inventory.adjust");
  await connectToDatabase();
  const organizationId = id(identity.context.organizationId);
  const [sites, materials] = await Promise.all([
    Site.find({ organizationId, status: "ACTIVE", deletedAt: null }).select("name code").sort({ name: 1 }),
    Material.find({ organizationId, status: "ACTIVE", deletedAt: null }).select("name code unit").sort({ name: 1 }),
  ]);
  return { sites: sites.map((site) => ({ id: site._id.toString(), name: site.name, code: site.code })), materials: materials.map((material) => ({ id: material._id.toString(), name: material.name, code: material.code, unit: material.unit as MaterialUnit })) };
}

export async function createAdjustment(identity: CurrentIdentity, input: AdjustmentInput, key: string): Promise<AdjustmentView> {
  requirePermission(identity, "inventory.adjust");
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/.test(key)) throw new AppError("IDEMPOTENCY_KEY_REQUIRED", "Provide a valid Idempotency-Key header.", 400);
  await connectToDatabase();
  await Promise.all([InventoryBatch.init(), InventoryBalance.init(), InventoryTransaction.init(), InventoryAdjustment.init(), IdempotencyKey.init(), ensureAuditReady()]);
  const organizationId = id(identity.context.organizationId);
  const siteId = id(input.siteId);
  const materialId = id(input.materialId);
  const performedBy = id(identity.context.userId);
  const requestHash = hashRequest(input);
  const replay = await previousResult(organizationId, key, requestHash);
  if (replay) return replay;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await mongoose.connection.transaction(async (session) => {
        const scope = { organizationId, siteId, materialId };
        const site = await Site.findOne({ organizationId, _id: siteId, status: "ACTIVE", deletedAt: null }).session(session);
        if (!site) throw new AppError("SITE_NOT_FOUND", "Choose an active site in your company.", 404);
        await lockSite(site, organizationId, session);
        const material = await Material.findOne({ organizationId, _id: materialId, status: "ACTIVE", deletedAt: null }).session(session);
        if (!material) throw new AppError("MATERIAL_NOT_FOUND", "Choose an active material in your company.", 404);
        if (!quantityFitsUnit(input.quantity, material.unit as MaterialUnit, true)) throw new AppError("INVALID_ADJUSTMENT", "Quantity does not match the material unit.", 422);
        await lockMaterial(material, organizationId, session);

        const adjustmentId = new mongoose.Types.ObjectId();
        const quantity = new Decimal(input.quantity);
        const cost = input.unitCost === undefined ? null : new Decimal(input.unitCost);
        let allocations: Array<{ batchId: mongoose.Types.ObjectId; quantity: mongoose.Types.Decimal128; unitCostSnapshot: mongoose.Types.Decimal128 }>;
        let deltaValue: Decimal;
        if (input.direction === "IN") {
          if (!cost) throw new AppError("INVALID_ADJUSTMENT", "Unit cost is required for incoming stock.", 422);
          const batchId = new mongoose.Types.ObjectId();
          const prefix = input.reasonCode === "OPENING_STOCK" ? "OPEN" : "ADJ";
          const [batch] = await InventoryBatch.create([{ _id: batchId, ...scope, batchCode: `${prefix}-${batchId.toString().slice(-12).toUpperCase()}`, receivedAt: new Date(), initialQuantity: stored(quantity), remainingQuantity: stored(quantity), reservedQuantity: stored(zero), unitCost: stored(cost), status: "ACTIVE", version: 0 }], { session });
          allocations = [{ batchId: batch._id, quantity: stored(quantity), unitCostSnapshot: batch.unitCost }];
          deltaValue = money(quantity.times(cost));
        } else {
          const result = await allocateOut(scope, input, session);
          allocations = result.allocations;
          deltaValue = result.valueRemoved.negated();
        }
        await updateBalance(scope, input.direction === "IN" ? quantity : quantity.negated(), deltaValue, session);
        const [adjustment] = await InventoryAdjustment.create([{ _id: adjustmentId, ...scope, direction: input.direction, quantity: stored(quantity), reasonCode: input.reasonCode, remarks: input.remarks, unitCost: cost ? stored(cost) : null, batchAllocations: allocations, createdBy: performedBy }], { session });
        await InventoryTransaction.create(allocations.map((allocation) => ({ ...scope, batchId: allocation.batchId, type: input.direction === "IN" ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT", quantity: input.direction === "IN" ? allocation.quantity : stored(new Decimal(allocation.quantity.toString()).negated()), unitCost: allocation.unitCostSnapshot, referenceType: "ADJUSTMENT", referenceId: adjustmentId, performedBy })), { session, ordered: true });
        await recordAudit({ organizationId, actorUserId: performedBy, action: "inventory.adjusted", entityType: "adjustment", entityId: adjustmentId.toString() }, session);
        const response = view(adjustment);
        await IdempotencyKey.create([{ organizationId, key, operation: "inventory.adjustment", requestHash, responseStatus: 201, resourceId: adjustmentId, responseBody: response, expiresAt: new Date(Date.now() + idempotencyRetentionMs) }], { session });
        return response;
      });
    } catch (error) {
      const committed = await previousResult(organizationId, key, requestHash);
      if (committed) return committed;
      if (isDuplicateKey(error) && attempt < 2) continue;
      if (isDuplicateKey(error)) throw new AppError("IDEMPOTENCY_REQUEST_IN_PROGRESS", "A matching request may be in progress. Retry shortly.", 409);
      throw error;
    }
  }
  throw new AppError("INVENTORY_VERSION_CONFLICT", "Inventory changed. Reload and try again.", 409);
}
