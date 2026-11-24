import "server-only";
import mongoose from "mongoose";

const openStatuses = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "ORDERED", "PARTIALLY_RECEIVED"];

export async function hasOpenPurchaseOrderForSite(organizationId: mongoose.Types.ObjectId, siteId: mongoose.Types.ObjectId, session: mongoose.ClientSession): Promise<boolean> {
  const db = mongoose.connection.db;
  if (!db) throw new Error("Database is not connected.");
  return Boolean(await db.collection("purchase_orders").findOne({ organizationId, siteId, status: { $in: openStatuses } }, { projection: { _id: 1 }, session }));
}
