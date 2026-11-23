import "server-only";
import mongoose from "mongoose";

const openStatuses = ["REQUESTED", "APPROVED", "DISPATCHED"];

export async function hasOpenTransferForMaterial(
  organizationId: mongoose.Types.ObjectId,
  materialId: mongoose.Types.ObjectId,
  session: mongoose.ClientSession,
): Promise<boolean> {
  const db = mongoose.connection.db;
  if (!db) throw new Error("Database is not connected.");
  const transfer = await db.collection("transfers").findOne({
    organizationId,
    materialId,
    status: { $in: openStatuses },
  }, { projection: { _id: 1 }, session });
  return Boolean(transfer);
}
