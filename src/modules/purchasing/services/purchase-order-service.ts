import "server-only";
import Decimal from "decimal.js";
import mongoose from "mongoose";
import { AuditLog } from "@/modules/audit/models/audit-log";
import { ensureAuditReady, recordAudit } from "@/modules/audit/services/record-audit";
import type { CurrentIdentity } from "@/modules/auth/services/auth-service";
import { isDuplicateKey } from "@/modules/auth/services/security";
import { User } from "@/modules/auth/models/identity";
import { Material } from "@/modules/materials/models/material";
import { quantityFitsUnit } from "@/modules/materials/schemas/catalogue";
import type { MaterialUnit } from "@/modules/materials/types";
import { Site } from "@/modules/sites/models/site";
import { Supplier } from "@/modules/suppliers/models/supplier";
import { hasOrganizationWideSiteAccess, requirePermission, requireSiteAccess } from "@/server/auth/authorize";
import { connectToDatabase } from "@/server/db/connect";
import { AppError } from "@/shared/errors/app-error";
import { PurchaseOrder } from "../models/purchase-order";
import { pricePurchaseOrder } from "../pricing";
import type { CreatePurchaseOrderInput, ListPurchaseOrdersQuery, PurchaseOrderStatus, UpdatePurchaseOrderInput } from "../schemas/purchase-order";
import type { PurchaseOrderView } from "../types";

type OrderDocument = InstanceType<typeof PurchaseOrder>;
const id = (value: string) => {
  if (!/^[a-fA-F0-9]{24}$/.test(value)) throw new AppError("PURCHASE_ORDER_NOT_FOUND", "Purchase order not found.", 404);
  return new mongoose.Types.ObjectId(value);
};
const stored = (value: string) => mongoose.Types.Decimal128.fromString(value);
const maxMoney = new Decimal(`${"9".repeat(32)}.99`);
const date = (value: string | null | undefined) => value ? new Date(`${value}T00:00:00.000Z`) : null;
const dateOnly = (value: Date | null | undefined) => value?.toISOString().slice(0, 10) ?? null;
const instant = (value: Date | null | undefined) => value?.toISOString() ?? null;
const quote = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function mutationError(error: unknown): never {
  if (isDuplicateKey(error)) throw new AppError("PURCHASE_ORDER_CONFLICT", "A purchase order number is already in use. Retry the request.", 409);
  if (error instanceof Error && error.name === "VersionError") throw new AppError("PURCHASE_ORDER_CHANGED", "This purchase order changed. Reload and try again.", 409);
  throw error;
}

async function lockActiveReferences(organizationId: mongoose.Types.ObjectId, input: CreatePurchaseOrderInput, session: mongoose.ClientSession) {
  const site = await Site.findOneAndUpdate({ _id: id(input.siteId), organizationId, status: "ACTIVE", deletedAt: null }, { $inc: { __v: 1 } }, { session });
  if (!site) throw new AppError("SITE_NOT_FOUND", "Choose an active site in your company.", 404);
  const supplier = await Supplier.findOneAndUpdate({ _id: id(input.supplierId), organizationId, status: "ACTIVE", deletedAt: null }, { $inc: { __v: 1 } }, { session });
  if (!supplier) throw new AppError("SUPPLIER_NOT_FOUND", "Choose an active supplier in your company.", 404);
  const materialMap = new Map<string, InstanceType<typeof Material>>();
  for (const materialId of [...new Set(input.items.map((line) => line.materialId.toLowerCase()))].sort()) {
    const material = await Material.findOneAndUpdate({ _id: id(materialId), organizationId, status: "ACTIVE", deletedAt: null }, { $inc: { __v: 1 } }, { session });
    if (!material) throw new AppError("MATERIAL_NOT_FOUND", "Choose active materials in your company.", 404);
    materialMap.set(materialId, material);
  }
  for (const line of input.items) {
    const material = materialMap.get(line.materialId.toLowerCase())!;
    if (!quantityFitsUnit(line.quantityOrdered, material.unit as MaterialUnit, true)) {
      throw new AppError("INVALID_ORDER_QUANTITY", `Quantity for ${material.code} does not match its unit.`, 422);
    }
  }
  return { site, supplier, materialMap };
}

function pricedLines(input: CreatePurchaseOrderInput, materialMap: Map<string, InstanceType<typeof Material>>, previous?: OrderDocument) {
  const pricing = pricePurchaseOrder(input.items);
  const amounts = [pricing.subtotal, pricing.taxTotal, pricing.grandTotal, ...pricing.lines.flatMap((line) => [line.subtotal, line.taxTotal, line.grandTotal])];
  if (amounts.some((amount) => new Decimal(amount).gt(maxMoney))) {
    throw new AppError("PURCHASE_ORDER_AMOUNT_TOO_LARGE", "Purchase order totals exceed the supported monetary range.", 422);
  }
  const lines = input.items.map((line, index) => {
    const existing = previous?.items.find((item) => item.materialId.toString() === line.materialId.toLowerCase());
    return {
      ...(existing ? { _id: existing._id } : {}),
      materialId: id(line.materialId), unit: materialMap.get(line.materialId.toLowerCase())!.unit,
      quantityOrdered: stored(line.quantityOrdered), quantityReceived: stored("0"),
      unitPrice: stored(line.unitPrice), taxRate: stored(line.taxRate),
      subtotal: stored(pricing.lines[index].subtotal), taxTotal: stored(pricing.lines[index].taxTotal), grandTotal: stored(pricing.lines[index].grandTotal),
    };
  });
  return { lines, pricing };
}

async function views(organizationId: mongoose.Types.ObjectId, orders: OrderDocument[]): Promise<PurchaseOrderView[]> {
  if (orders.length === 0) return [];
  const siteIds = [...new Set(orders.map((order) => order.siteId.toString()))].map(id);
  const supplierIds = [...new Set(orders.map((order) => order.supplierId.toString()))].map(id);
  const materialIds = [...new Set(orders.flatMap((order) => order.items.map((line) => line.materialId.toString())))].map(id);
  const [sites, suppliers, materials] = await Promise.all([
    Site.find({ organizationId, _id: { $in: siteIds } }).select("code name"),
    Supplier.find({ organizationId, _id: { $in: supplierIds } }).select("code name paymentTerms"),
    Material.find({ organizationId, _id: { $in: materialIds } }).select("code name unit"),
  ]);
  const siteMap = new Map(sites.map((site) => [site._id.toString(), site]));
  const supplierMap = new Map(suppliers.map((supplier) => [supplier._id.toString(), supplier]));
  const materialMap = new Map(materials.map((material) => [material._id.toString(), material]));
  return orders.map((order) => {
    const site = siteMap.get(order.siteId.toString());
    const supplier = supplierMap.get(order.supplierId.toString());
    if (!site || !supplier) throw new AppError("PURCHASE_ORDER_REFERENCE_MISSING", "Purchase order references are unavailable.", 500);
    return {
      id: order._id.toString(), poNumber: order.poNumber, status: order.status as PurchaseOrderStatus, version: order.__v,
      site: { id: site._id.toString(), code: site.code, name: site.name },
      supplier: { id: supplier._id.toString(), code: supplier.code, name: supplier.name, paymentTerms: supplier.paymentTerms ?? null },
      currencyCode: order.currencyCode,
      items: order.items.map((line) => {
        const material = materialMap.get(line.materialId.toString());
        if (!material) throw new AppError("PURCHASE_ORDER_REFERENCE_MISSING", "A purchase order material is unavailable.", 500);
        const quantityOrdered = line.quantityOrdered.toString();
        const quantityReceived = line.quantityReceived.toString();
        return {
          id: line._id.toString(), material: { id: material._id.toString(), code: material.code, name: material.name, unit: line.unit },
          quantityOrdered, quantityReceived, remainingQuantity: new Decimal(quantityOrdered).minus(quantityReceived).toString(),
          unitPrice: new Decimal(line.unitPrice.toString()).toFixed(2), taxRate: line.taxRate.toString(),
          subtotal: new Decimal(line.subtotal.toString()).toFixed(2), taxTotal: new Decimal(line.taxTotal.toString()).toFixed(2), grandTotal: new Decimal(line.grandTotal.toString()).toFixed(2),
        };
      }),
      subtotal: new Decimal(order.subtotal.toString()).toFixed(2), taxTotal: new Decimal(order.taxTotal.toString()).toFixed(2), grandTotal: new Decimal(order.grandTotal.toString()).toFixed(2),
      expectedDeliveryDate: dateOnly(order.expectedDeliveryDate), notes: order.notes ?? null,
      createdBy: order.createdBy.toString(), createdAt: order.createdAt.toISOString(), updatedAt: order.updatedAt.toISOString(),
      approval: {
        submittedAt: instant(order.approval.submittedAt), submittedBy: order.approval.submittedBy?.toString() ?? null,
        approvedAt: instant(order.approval.approvedAt), approvedBy: order.approval.approvedBy?.toString() ?? null, approvalRemarks: order.approval.approvalRemarks ?? null,
        rejectedAt: instant(order.approval.rejectedAt), rejectedBy: order.approval.rejectedBy?.toString() ?? null, rejectionRemarks: order.approval.rejectionRemarks ?? null,
      },
      orderedAt: instant(order.orderedAt), cancelledAt: instant(order.cancelledAt), cancellationRemarks: order.cancellationRemarks ?? null,
    };
  });
}

function allowedSites(identity: CurrentIdentity) {
  return hasOrganizationWideSiteAccess(identity) ? null : identity.context.assignedSiteIds.map(id);
}

export async function listPurchaseOrders(identity: CurrentIdentity, query: ListPurchaseOrdersQuery) {
  if (query.siteId) requireSiteAccess(identity, query.siteId);
  const allowed = allowedSites(identity);
  if (allowed?.length === 0) return { purchaseOrders: [] as PurchaseOrderView[], pagination: { nextCursor: null, hasMore: false, limit: query.limit } };
  await connectToDatabase();
  const organizationId = id(identity.context.organizationId);
  const filter = {
    organizationId,
    ...(query.siteId ? { siteId: id(query.siteId) } : allowed ? { siteId: { $in: allowed } } : {}),
    ...(query.supplierId ? { supplierId: id(query.supplierId) } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.q ? { poNumber: { $regex: quote(query.q), $options: "i" } } : {}),
    ...(query.cursor ? { _id: { $lt: id(query.cursor) } } : {}),
  };
  const documents = await PurchaseOrder.find(filter).sort({ _id: -1 }).limit(query.limit + 1);
  const hasMore = documents.length > query.limit;
  const page = documents.slice(0, query.limit);
  return { purchaseOrders: await views(organizationId, page), pagination: { nextCursor: hasMore ? page.at(-1)?._id.toString() ?? null : null, hasMore, limit: query.limit } };
}

async function findOrder(identity: CurrentIdentity, orderId: string, session?: mongoose.ClientSession) {
  const order = await PurchaseOrder.findOne({ _id: id(orderId), organizationId: id(identity.context.organizationId) }).session(session ?? null);
  if (!order) throw new AppError("PURCHASE_ORDER_NOT_FOUND", "Purchase order not found.", 404);
  requireSiteAccess(identity, order.siteId.toString());
  return order;
}

export async function getPurchaseOrder(identity: CurrentIdentity, orderId: string): Promise<PurchaseOrderView> {
  await connectToDatabase();
  return (await views(id(identity.context.organizationId), [await findOrder(identity, orderId)]))[0];
}

export async function listPurchaseOrderOptions(identity: CurrentIdentity) {
  await connectToDatabase();
  const organizationId = id(identity.context.organizationId);
  const allowed = allowedSites(identity);
  const [sites, suppliers, materials] = await Promise.all([
    Site.find({ organizationId, status: "ACTIVE", deletedAt: null, ...(allowed ? { _id: { $in: allowed } } : {}) }).select("code name").sort({ name: 1 }),
    Supplier.find({ organizationId, status: "ACTIVE", deletedAt: null }).select("code name paymentTerms").sort({ name: 1 }),
    Material.find({ organizationId, status: "ACTIVE", deletedAt: null }).select("code name unit").sort({ name: 1 }),
  ]);
  return {
    sites: sites.map((site) => ({ id: site._id.toString(), code: site.code, name: site.name })),
    suppliers: suppliers.map((supplier) => ({ id: supplier._id.toString(), code: supplier.code, name: supplier.name, paymentTerms: supplier.paymentTerms ?? null })),
    materials: materials.map((material) => ({ id: material._id.toString(), code: material.code, name: material.name, unit: material.unit as MaterialUnit })),
  };
}

export async function createPurchaseOrder(identity: CurrentIdentity, input: CreatePurchaseOrderInput): Promise<PurchaseOrderView> {
  requirePermission(identity, "purchase_order.create");
  requireSiteAccess(identity, input.siteId);
  if (new Set(input.items.map((line) => line.materialId.toLowerCase())).size !== input.items.length) throw new AppError("DUPLICATE_MATERIAL", "Add each material only once.", 422);
  await connectToDatabase();
  await Promise.all([PurchaseOrder.init(), ensureAuditReady()]);
  const organizationId = id(identity.context.organizationId);
  const actorUserId = id(identity.context.userId);
  try {
    const order = await mongoose.connection.transaction(async (session) => {
      const references = await lockActiveReferences(organizationId, input, session);
      const { lines, pricing } = pricedLines(input, references.materialMap);
      const orderId = new mongoose.Types.ObjectId();
      const poNumber = `PO-${new Date().getUTCFullYear()}-${orderId.toString().slice(-12).toUpperCase()}`;
      const [created] = await PurchaseOrder.create([{ _id: orderId, organizationId, siteId: references.site._id, supplierId: references.supplier._id, poNumber, status: "DRAFT", currencyCode: identity.organization.currencyCode, items: lines, subtotal: stored(pricing.subtotal), taxTotal: stored(pricing.taxTotal), grandTotal: stored(pricing.grandTotal), expectedDeliveryDate: date(input.expectedDeliveryDate), notes: input.notes, createdBy: actorUserId }], { session });
      await recordAudit({ organizationId, actorUserId, action: "purchase_order.created", entityType: "purchase_order", entityId: orderId.toString() }, session);
      return created;
    });
    return (await views(organizationId, [order]))[0];
  } catch (error) { return mutationError(error); }
}

export async function updatePurchaseOrder(identity: CurrentIdentity, orderId: string, input: UpdatePurchaseOrderInput): Promise<PurchaseOrderView> {
  requirePermission(identity, "purchase_order.create");
  await connectToDatabase();
  await ensureAuditReady();
  const organizationId = id(identity.context.organizationId);
  const actorUserId = id(identity.context.userId);
  try {
    const order = await mongoose.connection.transaction(async (session) => {
      const current = await findOrder(identity, orderId, session);
      if (current.status !== "DRAFT") throw new AppError("INVALID_PURCHASE_ORDER_STATE", "Only draft purchase orders can be edited.", 409);
      if (!hasOrganizationWideSiteAccess(identity) && current.createdBy.toString() !== identity.context.userId) throw new AppError("FORBIDDEN", "Only the creator can edit this draft.", 403);
      const nextSiteId = input.siteId ?? current.siteId.toString();
      requireSiteAccess(identity, nextSiteId);
      const merged: CreatePurchaseOrderInput = {
        siteId: nextSiteId, supplierId: input.supplierId ?? current.supplierId.toString(),
        expectedDeliveryDate: input.expectedDeliveryDate === undefined ? dateOnly(current.expectedDeliveryDate) : input.expectedDeliveryDate,
        notes: input.notes === undefined ? current.notes ?? null : input.notes,
        items: input.items ?? current.items.map((line) => ({ materialId: line.materialId.toString(), quantityOrdered: line.quantityOrdered.toString(), unitPrice: line.unitPrice.toString(), taxRate: line.taxRate.toString() })),
      };
      if (new Set(merged.items.map((line) => line.materialId.toLowerCase())).size !== merged.items.length) throw new AppError("DUPLICATE_MATERIAL", "Add each material only once.", 422);
      const references = await lockActiveReferences(organizationId, merged, session);
      const { lines, pricing } = pricedLines(merged, references.materialMap, current);
      current.siteId = references.site._id;
      current.supplierId = references.supplier._id;
      current.items = lines as typeof current.items;
      current.subtotal = stored(pricing.subtotal); current.taxTotal = stored(pricing.taxTotal); current.grandTotal = stored(pricing.grandTotal);
      current.expectedDeliveryDate = date(merged.expectedDeliveryDate); current.notes = merged.notes;
      await current.save({ session });
      await recordAudit({ organizationId, actorUserId, action: "purchase_order.updated", entityType: "purchase_order", entityId: orderId }, session);
      return current;
    });
    return (await views(organizationId, [order]))[0];
  } catch (error) { return mutationError(error); }
}

export type PurchaseOrderAction = "submit" | "approve" | "reject" | "mark-ordered" | "cancel";

export async function transitionPurchaseOrder(identity: CurrentIdentity, orderId: string, action: PurchaseOrderAction, remarks?: string): Promise<PurchaseOrderView> {
  if ((action === "reject" || action === "cancel") && (!remarks || remarks.trim().length < 8 || remarks.length > 500)) throw new AppError("REASON_REQUIRED", "Provide a reason of 8 to 500 characters.", 422);
  if (action === "submit") requirePermission(identity, "purchase_order.create");
  if (action === "approve" || action === "reject") requirePermission(identity, "purchase_order.approve");
  if (action === "mark-ordered") requirePermission(identity, "purchase_order.order");
  await connectToDatabase();
  await ensureAuditReady();
  const organizationId = id(identity.context.organizationId);
  const actorUserId = id(identity.context.userId);
  try {
    const order = await mongoose.connection.transaction(async (session) => {
      const current = await findOrder(identity, orderId, session);
      const at = new Date();
      switch (action) {
        case "submit":
          if (current.status !== "DRAFT") throw new AppError("INVALID_PURCHASE_ORDER_STATE", "Only drafts can be submitted.", 409);
          if (!hasOrganizationWideSiteAccess(identity) && current.createdBy.toString() !== identity.context.userId) throw new AppError("FORBIDDEN", "Only the creator can submit this draft.", 403);
          current.status = "PENDING_APPROVAL"; current.approval.submittedAt = at; current.approval.submittedBy = actorUserId;
          break;
        case "approve":
          if (current.status !== "PENDING_APPROVAL") throw new AppError("INVALID_PURCHASE_ORDER_STATE", "Only pending orders can be approved.", 409);
          current.status = "APPROVED"; current.approval.approvedAt = at; current.approval.approvedBy = actorUserId; current.approval.approvalRemarks = remarks ?? null;
          break;
        case "reject":
          if (current.status !== "PENDING_APPROVAL") throw new AppError("INVALID_PURCHASE_ORDER_STATE", "Only pending orders can be rejected.", 409);
          current.status = "REJECTED"; current.approval.rejectedAt = at; current.approval.rejectedBy = actorUserId; current.approval.rejectionRemarks = remarks ?? null;
          break;
        case "mark-ordered":
          if (current.status !== "APPROVED") throw new AppError("INVALID_PURCHASE_ORDER_STATE", "Only approved orders can be marked ordered.", 409);
          current.status = "ORDERED"; current.orderedAt = at; current.orderedBy = actorUserId;
          break;
        case "cancel":
          if (!["DRAFT", "APPROVED", "ORDERED"].includes(current.status)) throw new AppError("INVALID_PURCHASE_ORDER_STATE", "This purchase order cannot be cancelled.", 409);
          if (current.status === "DRAFT") {
            if (!identity.membership.permissions.includes("purchase_order.create") || (!hasOrganizationWideSiteAccess(identity) && current.createdBy.toString() !== identity.context.userId)) throw new AppError("FORBIDDEN", "Only the creator or an administrator can cancel this draft.", 403);
          } else if (!identity.membership.permissions.includes("purchase_order.approve")) throw new AppError("FORBIDDEN", "Only an approver can cancel this order.", 403);
          current.status = "CANCELLED"; current.cancelledAt = at; current.cancelledBy = actorUserId; current.cancellationRemarks = remarks ?? null;
          break;
      }
      await current.save({ session });
      await recordAudit({ organizationId, actorUserId, action: `purchase_order.${action.replace("-", "_")}`, entityType: "purchase_order", entityId: orderId }, session);
      return current;
    });
    return (await views(organizationId, [order]))[0];
  } catch (error) { return mutationError(error); }
}

export async function listPurchaseOrderActivity(identity: CurrentIdentity, orderId: string) {
  await connectToDatabase();
  await findOrder(identity, orderId);
  const organizationId = id(identity.context.organizationId);
  const records = await AuditLog.find({ organizationId, entityType: "purchase_order", entityId: orderId }).sort({ createdAt: -1 }).limit(30);
  const users = await User.find({ _id: { $in: [...new Set(records.map((record) => record.actorUserId.toString()))].map(id) } }).select("name");
  const names = new Map(users.map((user) => [user._id.toString(), user.name]));
  return records.map((record) => ({ id: record._id.toString(), action: record.action, actor: names.get(record.actorUserId.toString()) ?? "Former member", createdAt: record.createdAt.toISOString() }));
}
