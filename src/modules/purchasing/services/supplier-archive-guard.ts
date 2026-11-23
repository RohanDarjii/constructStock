import "server-only";
import mongoose from "mongoose";

const openStatuses = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "ORDERED", "PARTIALLY_RECEIVED"];

// Purchase-order creation must also lock the supplier document in its transaction,
// so an order cannot be created concurrently with an archive operation.

export async function hasOpenPurchaseOrderForSupplier(organizationId: mongoose.Types.ObjectId, supplierId: mongoose.Types.ObjectId, session: mongoose.ClientSession): Promise<boolean> {
  const db = mongoose.connection.db;
  if (!db) throw new Error("Database is not connected.");
  return Boolean(await db.collection("purchase_orders").findOne({ organizationId, supplierId, status: { $in: openStatuses } }, { projection: { _id: 1 }, session }));
}
