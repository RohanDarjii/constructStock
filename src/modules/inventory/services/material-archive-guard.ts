import "server-only";
import mongoose from "mongoose";

/** A material with stock or a reservation at any site remains in the active catalogue. */
export async function hasMaterialStock(
  organizationId: mongoose.Types.ObjectId,
  materialId: mongoose.Types.ObjectId,
  session: mongoose.ClientSession,
): Promise<boolean> {
  const db = mongoose.connection.db;
  if (!db) throw new Error("Database is not connected.");
  const zero = mongoose.Types.Decimal128.fromString("0");
  const scope = { organizationId, materialId };
  const balance = await db.collection("inventory_balances").findOne({
    ...scope,
    $or: [{ onHandQuantity: { $gt: zero } }, { reservedQuantity: { $gt: zero } }],
  }, { projection: { _id: 1 }, session });
  if (balance) return true;

  const batch = await db.collection("inventory_batches").findOne({
    ...scope,
    $or: [{ remainingQuantity: { $gt: zero } }, { reservedQuantity: { $gt: zero } }],
  }, { projection: { _id: 1 }, session });
  return Boolean(batch);
}
