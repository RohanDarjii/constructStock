import "server-only";
import mongoose from "mongoose";

/** A site holding on-hand or reserved stock cannot be archived. */
export async function hasSiteStock(
  organizationId: mongoose.Types.ObjectId,
  siteId: mongoose.Types.ObjectId,
  session: mongoose.ClientSession,
): Promise<boolean> {
  const db = mongoose.connection.db;
  if (!db) throw new Error("Database is not connected.");
  const zero = mongoose.Types.Decimal128.fromString("0");
  const scope = { organizationId, siteId };
  const balance = await db.collection("inventory_balances").findOne({
    ...scope,
    $or: [{ onHandQuantity: { $gt: zero } }, { reservedQuantity: { $gt: zero } }],
  }, { projection: { _id: 1 }, session });
  if (balance) return true;
  const batch = await db.collection("inventory_batches").findOne({
    ...scope,
    $or: [{ remainingQuantity: { $gt: zero } }, { reservedQuantity: { $gt: zero } }],
  }, { projection: { _id: 1 }, session });
  if (batch) return true;
  // An empty site may still be the source or destination of an open transfer.
  const transfer = await db.collection("transfers").findOne({
    organizationId, status: { $in: ["REQUESTED", "APPROVED", "DISPATCHED"] },
    $or: [{ sourceSiteId: siteId }, { destinationSiteId: siteId }],
  }, { projection: { _id: 1 }, session });
  return Boolean(transfer);
}
