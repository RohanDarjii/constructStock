import "server-only";
import Decimal from "decimal.js";
import mongoose from "mongoose";
import { AppError } from "@/shared/errors/app-error";
import { InventoryBatch } from "../models/inventory-batch";

const D = Decimal.clone({ precision: 80 });
const stored = (value: Decimal) => mongoose.Types.Decimal128.fromString(new D(value).toString());
const money = (value: Decimal) => value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
type Scope = { organizationId: mongoose.Types.ObjectId; siteId: mongoose.Types.ObjectId; materialId: mongoose.Types.ObjectId };

export type StockAllocation = {
  batchId: mongoose.Types.ObjectId;
  quantity: mongoose.Types.Decimal128;
  unitCostSnapshot: mongoose.Types.Decimal128;
  valueRemoved: mongoose.Types.Decimal128;
};

export async function allocateStockOut(
  scope: Scope,
  quantity: string,
  method: "FIFO" | "MANUAL",
  manual: Array<{ batchId: string; quantity: string }> | undefined,
  session: mongoose.ClientSession,
): Promise<{ allocations: StockAllocation[]; valueRemoved: Decimal }> {
  const batches = await InventoryBatch.find({ ...scope, status: "ACTIVE", remainingQuantity: { $gt: stored(new D(0)) } })
    .sort({ receivedAt: 1, _id: 1 }).session(session);
  const selected = method === "FIFO" ? batches.map((batch) => ({ batch, requested: null as Decimal | null })) : (manual ?? []).map((entry) => ({
    batch: batches.find((batch) => batch._id.toString() === entry.batchId.toLowerCase()),
    requested: new D(entry.quantity) as Decimal | null,
  }));
  if (method === "MANUAL") {
    if (new Set((manual ?? []).map((entry) => entry.batchId.toLowerCase())).size !== manual?.length || selected.some((entry) => !entry.batch)) {
      throw new AppError("INVALID_BATCH_ALLOCATION", "Select active batches at this site for this material.", 422);
    }
    if (!(manual ?? []).reduce((sum, entry) => sum.plus(entry.quantity), new D(0)).eq(quantity)) {
      throw new AppError("INVALID_BATCH_ALLOCATION", "Manual batch quantities must equal the issue quantity.", 422);
    }
  }
  let needed = new D(quantity);
  let valueRemoved: Decimal = new D(0);
  const allocations: StockAllocation[] = [];
  for (const entry of selected) {
    if (needed.isZero()) break;
    const batch = entry.batch;
    if (!batch) throw new AppError("INVALID_BATCH_ALLOCATION", "A selected batch is unavailable.", 422);
    const remaining = new D(batch.remainingQuantity.toString());
    const available = remaining.minus(batch.reservedQuantity.toString());
    if (available.lte(0)) {
      if (method === "MANUAL") throw new AppError("INSUFFICIENT_STOCK", "A selected batch has no available stock.", 409);
      continue;
    }
    const taken = entry.requested ?? D.min(needed, available);
    if (taken.gt(available) || taken.gt(needed)) throw new AppError("INSUFFICIENT_STOCK", "A selected batch cannot cover the requested quantity.", 409);
    const after = remaining.minus(taken);
    const cost = new D(batch.unitCost.toString());
    const removed = money(remaining.times(cost)).minus(money(after.times(cost)));
    const result = await InventoryBatch.updateOne(
      { _id: batch._id, ...scope, status: "ACTIVE", version: batch.version, remainingQuantity: batch.remainingQuantity, reservedQuantity: batch.reservedQuantity },
      { $set: { remainingQuantity: stored(after), status: after.isZero() ? "DEPLETED" : "ACTIVE" }, $inc: { version: 1 } },
      { session },
    );
    if (result.matchedCount !== 1) throw new AppError("INVENTORY_VERSION_CONFLICT", "A batch changed. Reload and try again.", 409);
    allocations.push({ batchId: batch._id, quantity: stored(taken), unitCostSnapshot: batch.unitCost, valueRemoved: stored(removed) });
    valueRemoved = valueRemoved.plus(removed);
    needed = needed.minus(taken);
  }
  if (!needed.isZero()) throw new AppError("INSUFFICIENT_STOCK", "Available batch stock is insufficient.", 409);
  return { allocations, valueRemoved };
}
