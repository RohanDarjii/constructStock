import "server-only";
import mongoose from "mongoose";

const openStatuses = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "ORDERED", "PARTIALLY_RECEIVED"];

export async function hasOpenPurchaseOrderForMaterial(
  organizationId: mongoose.Types.ObjectId,
  materialId: mongoose.Types.ObjectId,
  session: mongoose.ClientSession,
): Promise<boolean> {
  const db = mongoose.connection.db;
  if (!db) throw new Error("Database is not connected.");
  const order = await db.collection("purchase_orders").findOne({
    organizationId,
    "items.materialId": materialId,
    status: { $in: openStatuses },
  }, { projection: { _id: 1 }, session });
  return Boolean(order);
}
