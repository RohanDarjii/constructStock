import "server-only";
import mongoose from "mongoose";
import { ensureAuditReady, recordAudit } from "@/modules/audit/services/record-audit";
import type { CurrentIdentity } from "@/modules/auth/services/auth-service";
import { isDuplicateKey } from "@/modules/auth/services/security";
import { hasOpenPurchaseOrderForSupplier } from "@/modules/purchasing/services/supplier-archive-guard";
import { requirePermission } from "@/server/auth/authorize";
import { connectToDatabase } from "@/server/db/connect";
import { AppError } from "@/shared/errors/app-error";
import { Supplier } from "../models/supplier";
import { findSupplier, listSupplierDocuments, type SupplierDocument } from "../repositories/supplier-repository";
import type { CreateSupplierInput, ListSuppliersQuery, UpdateSupplierInput } from "../schemas/supplier";
import type { SupplierView } from "../types";

function objectId(value: string): mongoose.Types.ObjectId {
  if (!/^[a-fA-F0-9]{24}$/.test(value)) throw new AppError("SUPPLIER_NOT_FOUND", "Supplier not found.", 404);
  return new mongoose.Types.ObjectId(value);
}

function view(supplier: SupplierDocument): SupplierView {
  const address = supplier.address;
  return {
    id: supplier._id.toString(), code: supplier.code, name: supplier.name,
    contactPerson: supplier.contactPerson ?? null, phone: supplier.phone ?? null, email: supplier.email ?? null,
    address: address ? { line1: address.line1, city: address.city, state: address.state, postalCode: address.postalCode, country: address.country } : null,
    gstNumber: supplier.gstNumber ?? null, paymentTerms: supplier.paymentTerms ?? null,
    status: supplier.status as SupplierView["status"], createdAt: supplier.createdAt.toISOString(), updatedAt: supplier.updatedAt.toISOString(),
  };
}

function mutationError(error: unknown): never {
  if (isDuplicateKey(error)) throw new AppError("SUPPLIER_CODE_EXISTS", "A supplier with this code already exists in your company.", 409);
  if (error instanceof Error && error.name === "VersionError") throw new AppError("SUPPLIER_CHANGED", "This supplier changed. Reload and try again.", 409);
  throw error;
}

export async function listSuppliers(identity: CurrentIdentity, query: ListSuppliersQuery) {
  await connectToDatabase();
  const documents = await listSupplierDocuments(objectId(identity.context.organizationId), query);
  const hasMore = documents.length > query.limit;
  const page = documents.slice(0, query.limit);
  return {
    suppliers: page.map(view),
    pagination: { nextCursor: hasMore ? page.at(-1)?._id.toString() ?? null : null, hasMore, limit: query.limit },
  };
}

export async function getSupplier(identity: CurrentIdentity, supplierId: string): Promise<SupplierView> {
  await connectToDatabase();
  const supplier = await findSupplier(objectId(identity.context.organizationId), objectId(supplierId));
  if (!supplier) throw new AppError("SUPPLIER_NOT_FOUND", "Supplier not found.", 404);
  return view(supplier);
}

export async function createSupplier(identity: CurrentIdentity, input: CreateSupplierInput): Promise<SupplierView> {
  requirePermission(identity, "supplier.manage");
  await connectToDatabase();
  await Promise.all([Supplier.init(), ensureAuditReady()]);
  const organizationId = objectId(identity.context.organizationId);
  const actorUserId = objectId(identity.context.userId);
  try {
    const supplier = await mongoose.connection.transaction(async (session) => {
      const [created] = await Supplier.create([{ ...input, organizationId, createdBy: actorUserId }], { session });
      await recordAudit({ organizationId, actorUserId, action: "supplier.created", entityType: "supplier", entityId: created._id.toString() }, session);
      return created;
    });
    return view(supplier);
  } catch (error) { return mutationError(error); }
}

export async function updateSupplier(identity: CurrentIdentity, supplierId: string, input: UpdateSupplierInput): Promise<SupplierView> {
  requirePermission(identity, "supplier.manage");
  await connectToDatabase();
  await ensureAuditReady();
  const organizationId = objectId(identity.context.organizationId);
  const actorUserId = objectId(identity.context.userId);
  try {
    const supplier = await mongoose.connection.transaction(async (session) => {
      const found = await findSupplier(organizationId, objectId(supplierId), session);
      if (!found) throw new AppError("SUPPLIER_NOT_FOUND", "Supplier not found.", 404);
      if (found.status === "ARCHIVED") throw new AppError("SUPPLIER_ARCHIVED", "Restore this supplier before editing it.", 409);
      found.set(input);
      await found.save({ session });
      await recordAudit({ organizationId, actorUserId, action: "supplier.updated", entityType: "supplier", entityId: supplierId }, session);
      return found;
    });
    return view(supplier);
  } catch (error) { return mutationError(error); }
}

async function changeArchive(identity: CurrentIdentity, supplierId: string, restore: boolean): Promise<SupplierView> {
  requirePermission(identity, "supplier.manage");
  await connectToDatabase();
  await ensureAuditReady();
  const organizationId = objectId(identity.context.organizationId);
  const actorUserId = objectId(identity.context.userId);
  try {
    const supplier = await mongoose.connection.transaction(async (session) => {
      const found = await findSupplier(organizationId, objectId(supplierId), session);
      if (!found) throw new AppError("SUPPLIER_NOT_FOUND", "Supplier not found.", 404);
      if (restore && found.status !== "ARCHIVED") throw new AppError("SUPPLIER_NOT_ARCHIVED", "This supplier is not archived.", 409);
      if (!restore && found.status === "ARCHIVED") throw new AppError("SUPPLIER_ARCHIVED", "This supplier is already archived.", 409);
      if (!restore && await hasOpenPurchaseOrderForSupplier(organizationId, found._id, session)) {
        throw new AppError("SUPPLIER_HAS_OPEN_ORDERS", "This supplier has an open purchase order.", 409);
      }
      found.status = restore ? "ACTIVE" : "ARCHIVED";
      found.deletedAt = restore ? null : new Date();
      found.deletedBy = restore ? null : actorUserId;
      await found.save({ session });
      await recordAudit({ organizationId, actorUserId, action: restore ? "supplier.restored" : "supplier.archived", entityType: "supplier", entityId: supplierId }, session);
      return found;
    });
    return view(supplier);
  } catch (error) { return mutationError(error); }
}

export const archiveSupplier = (identity: CurrentIdentity, supplierId: string) => changeArchive(identity, supplierId, false);
export const restoreSupplier = (identity: CurrentIdentity, supplierId: string) => changeArchive(identity, supplierId, true);
