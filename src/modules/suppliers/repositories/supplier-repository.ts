import "server-only";
import mongoose from "mongoose";
import { Supplier } from "../models/supplier";
import type { ListSuppliersQuery } from "../schemas/supplier";

export type SupplierDocument = InstanceType<typeof Supplier>;

export function findSupplier(organizationId: mongoose.Types.ObjectId, supplierId: mongoose.Types.ObjectId, session?: mongoose.ClientSession) {
  return Supplier.findOne({ organizationId, _id: supplierId }).session(session ?? null);
}

export function listSupplierDocuments(organizationId: mongoose.Types.ObjectId, query: ListSuppliersQuery) {
  const escaped = query.q?.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return Supplier.find({
    organizationId,
    status: query.status,
    ...(query.cursor ? { _id: { $lt: new mongoose.Types.ObjectId(query.cursor) } } : {}),
    ...(escaped ? { $or: [{ code: { $regex: escaped, $options: "i" } }, { name: { $regex: escaped, $options: "i" } }, { contactPerson: { $regex: escaped, $options: "i" } }] } : {}),
  }).sort({ _id: -1 }).limit(query.limit + 1);
}
