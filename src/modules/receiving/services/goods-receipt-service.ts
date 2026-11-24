import "server-only";
import { createHash } from "node:crypto";
import Decimal from "decimal.js";
import mongoose from "mongoose";
import { ensureAuditReady, recordAudit } from "@/modules/audit/services/record-audit";
import type { CurrentIdentity } from "@/modules/auth/services/auth-service";
import { isDuplicateKey } from "@/modules/auth/services/security";
import { User } from "@/modules/auth/models/identity";
import { IdempotencyKey } from "@/modules/inventory/models/idempotency-key";
import { InventoryBalance } from "@/modules/inventory/models/inventory-balance";
import { InventoryBatch } from "@/modules/inventory/models/inventory-batch";
import { InventoryTransaction } from "@/modules/inventory/models/inventory-transaction";
import { Material } from "@/modules/materials/models/material";
import { quantityFitsUnit } from "@/modules/materials/schemas/catalogue";
import type { MaterialUnit } from "@/modules/materials/types";
import { PurchaseOrder } from "@/modules/purchasing/models/purchase-order";
import { Site } from "@/modules/sites/models/site";
import { Supplier } from "@/modules/suppliers/models/supplier";
import { hasOrganizationWideSiteAccess, requirePermission, requireSiteAccess } from "@/server/auth/authorize";
import { connectToDatabase } from "@/server/db/connect";
import { AppError } from "@/shared/errors/app-error";
import { GoodsReceipt } from "../models/goods-receipt";
import type { CreateGoodsReceiptInput, ListGoodsReceiptsQuery } from "../schemas/goods-receipt";
import type { GoodsReceiptView, ReceiptMutationResult } from "../types";

type ReceiptDocument = InstanceType<typeof GoodsReceipt>;
const D = Decimal.clone({ precision: 80 });
const zero = new D(0);
const maxMoney = new D(`${"9".repeat(32)}.99`);
const retentionMs = 7 * 24 * 60 * 60 * 1000;
const keyPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;
const id = (value: string) => {
  if (!/^[a-fA-F0-9]{24}$/.test(value)) throw new AppError("GOODS_RECEIPT_NOT_FOUND", "Goods receipt not found.", 404);
  return new mongoose.Types.ObjectId(value);
};
const stored = (value: string | Decimal) => mongoose.Types.Decimal128.fromString(new D(value).toString());
const money = (value: Decimal) => value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
const displayMoney = (value: mongoose.Types.Decimal128) => new D(value.toString()).toFixed(2);
const fingerprint = (input: unknown) => createHash("sha256").update(JSON.stringify(input)).digest("hex");
const escaped = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function checkMoney(value: Decimal): void {
  if (value.gt(maxMoney) || value.lt(0)) throw new AppError("RECEIPT_AMOUNT_TOO_LARGE", "Receipt value is outside the supported monetary range.", 422);
}

async function ready(): Promise<void> {
  await Promise.all([GoodsReceipt.init(), PurchaseOrder.init(), InventoryBatch.init(), InventoryBalance.init(), InventoryTransaction.init(), IdempotencyKey.init(), ensureAuditReady()]);
}

async function previousResult(organizationId: mongoose.Types.ObjectId, key: string, operation: string, requestHash: string): Promise<ReceiptMutationResult | null> {
  const previous = await IdempotencyKey.findOne({ organizationId, key });
  if (!previous) return null;
  if (previous.operation !== operation || previous.requestHash !== requestHash) throw new AppError("IDEMPOTENCY_KEY_REUSED", "This idempotency key was already used with a different request.", 409);
  return previous.responseBody as ReceiptMutationResult;
}

async function saveIdempotency(organizationId: mongoose.Types.ObjectId, key: string, operation: string, requestHash: string, result: ReceiptMutationResult, session: mongoose.ClientSession): Promise<void> {
  await IdempotencyKey.create([{ organizationId, key, operation, requestHash, responseStatus: operation === "goods_receipt.confirm" ? 201 : 200, resourceId: id(result.id), responseBody: result, expiresAt: new Date(Date.now() + retentionMs) }], { session });
}

async function receiptViews(organizationId: mongoose.Types.ObjectId, receipts: ReceiptDocument[]): Promise<GoodsReceiptView[]> {
  if (!receipts.length) return [];
  const poIds = [...new Set(receipts.map((receipt) => receipt.purchaseOrderId.toString()))].map(id);
  const siteIds = [...new Set(receipts.map((receipt) => receipt.siteId.toString()))].map(id);
  const supplierIds = [...new Set(receipts.map((receipt) => receipt.supplierId.toString()))].map(id);
  const materialIds = [...new Set(receipts.flatMap((receipt) => receipt.items.map((item) => item.materialId.toString())))].map(id);
  const batchIds = [...new Set(receipts.flatMap((receipt) => receipt.items.map((item) => item.batchId.toString())))].map(id);
  const userIds = [...new Set(receipts.map((receipt) => receipt.receivedBy.toString()))].map(id);
  const [orders, sites, suppliers, materials, batches, users] = await Promise.all([
    PurchaseOrder.find({ organizationId, _id: { $in: poIds } }).select("poNumber status"),
    Site.find({ organizationId, _id: { $in: siteIds } }).select("code name"),
    Supplier.find({ organizationId, _id: { $in: supplierIds } }).select("code name"),
    Material.find({ organizationId, _id: { $in: materialIds } }).select("code name unit"),
    InventoryBatch.find({ organizationId, _id: { $in: batchIds } }).select("batchCode"),
    User.find({ _id: { $in: userIds } }).select("name"),
  ]);
  const byId = <T extends { _id: mongoose.Types.ObjectId }>(documents: T[]) => new Map(documents.map((document) => [document._id.toString(), document]));
  const poMap = byId(orders), siteMap = byId(sites), supplierMap = byId(suppliers), materialMap = byId(materials), batchMap = byId(batches), userMap = byId(users);
  return receipts.map((receipt) => {
    const order = poMap.get(receipt.purchaseOrderId.toString());
    const site = siteMap.get(receipt.siteId.toString());
    const supplier = supplierMap.get(receipt.supplierId.toString());
    if (!order || !site || !supplier) throw new AppError("RECEIPT_REFERENCE_MISSING", "Receipt references are unavailable.", 500);
    const receiver = userMap.get(receipt.receivedBy.toString());
    return {
      id: receipt._id.toString(), receiptNumber: receipt.receiptNumber, status: receipt.status as GoodsReceiptView["status"],
      purchaseOrder: { id: order._id.toString(), poNumber: order.poNumber, status: order.status },
      site: { id: site._id.toString(), code: site.code, name: site.name },
      supplier: { id: supplier._id.toString(), code: supplier.code, name: supplier.name },
      receivedAt: receipt.receivedAt.toISOString(), createdAt: receipt.createdAt.toISOString(),
      receivedBy: { id: receipt.receivedBy.toString(), name: receiver?.name ?? "Former member" },
      invoiceNumber: receipt.invoiceNumber ?? null, deliveryChallanNumber: receipt.deliveryChallanNumber ?? null, notes: receipt.notes ?? null,
      reversedAt: receipt.reversedAt?.toISOString() ?? null, reversedBy: receipt.reversedBy?.toString() ?? null, reversalReason: receipt.reversalReason ?? null,
      netTotal: displayMoney(receipt.netTotal),
      items: receipt.items.map((item) => {
        const material = materialMap.get(item.materialId.toString());
        const batch = batchMap.get(item.batchId.toString());
        if (!material || !batch) throw new AppError("RECEIPT_REFERENCE_MISSING", "Receipt material or batch is unavailable.", 500);
        return {
          purchaseOrderItemId: item.purchaseOrderItemId.toString(),
          material: { id: material._id.toString(), code: material.code, name: material.name, unit: material.unit },
          quantityReceived: item.quantityReceived.toString(), supplierBatchNumber: item.supplierBatchNumber ?? null,
          unitCost: displayMoney(item.unitCost), netAmount: displayMoney(item.netAmount),
          batchId: item.batchId.toString(), batchCode: batch.batchCode, transactionId: item.transactionId.toString(),
        };
      }),
    };
  });
}

export async function listGoodsReceipts(identity: CurrentIdentity, query: ListGoodsReceiptsQuery) {
  requirePermission(identity, "inventory.view");
  if (query.siteId) requireSiteAccess(identity, query.siteId);
  const allowed = hasOrganizationWideSiteAccess(identity) ? null : identity.context.assignedSiteIds.map(id);
  if (allowed?.length === 0) return { receipts: [] as GoodsReceiptView[], pagination: { nextCursor: null, hasMore: false, limit: query.limit } };
  await connectToDatabase();
  const organizationId = id(identity.context.organizationId);
  const search = query.q ? { $regex: escaped(query.q), $options: "i" } : null;
  const matchingOrders = search ? await PurchaseOrder.find({ organizationId, poNumber: search }).select("_id") : [];
  const filter = {
    organizationId,
    ...(query.siteId ? { siteId: id(query.siteId) } : allowed ? { siteId: { $in: allowed } } : {}),
    ...(query.supplierId ? { supplierId: id(query.supplierId) } : {}),
    ...(query.purchaseOrderId ? { purchaseOrderId: id(query.purchaseOrderId) } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(search ? { $or: [{ receiptNumber: search }, { purchaseOrderId: { $in: matchingOrders.map((order) => order._id) } }] } : {}),
    ...(query.cursor ? { _id: { $lt: id(query.cursor) } } : {}),
  };
  const docs = await GoodsReceipt.find(filter).sort({ _id: -1 }).limit(query.limit + 1);
  const hasMore = docs.length > query.limit;
  const page = docs.slice(0, query.limit);
  return { receipts: await receiptViews(organizationId, page), pagination: { nextCursor: hasMore ? page.at(-1)?._id.toString() ?? null : null, hasMore, limit: query.limit } };
}

export async function listGoodsReceiptFilters(identity: CurrentIdentity) {
  requirePermission(identity, "inventory.view");
  await connectToDatabase();
  const organizationId = id(identity.context.organizationId);
  const allowed = hasOrganizationWideSiteAccess(identity) ? null : identity.context.assignedSiteIds.map(id);
  const [sites, suppliers] = await Promise.all([
    Site.find({ organizationId, ...(allowed ? { _id: { $in: allowed } } : {}) }).select("code name").sort({ name: 1 }),
    Supplier.find({ organizationId }).select("code name").sort({ name: 1 }),
  ]);
  return { sites: sites.map((site) => ({ id: site._id.toString(), code: site.code, name: site.name })), suppliers: suppliers.map((supplier) => ({ id: supplier._id.toString(), code: supplier.code, name: supplier.name })) };
}

export async function getGoodsReceipt(identity: CurrentIdentity, receiptId: string): Promise<GoodsReceiptView> {
  requirePermission(identity, "inventory.view");
  await connectToDatabase();
  const organizationId = id(identity.context.organizationId);
  const receipt = await GoodsReceipt.findOne({ _id: id(receiptId), organizationId });
  if (!receipt) throw new AppError("GOODS_RECEIPT_NOT_FOUND", "Goods receipt not found.", 404);
  requireSiteAccess(identity, receipt.siteId.toString());
  return (await receiptViews(organizationId, [receipt]))[0];
}

export async function listPurchaseOrderReceipts(identity: CurrentIdentity, purchaseOrderId: string) {
  requirePermission(identity, "inventory.view");
  await connectToDatabase();
  const organizationId = id(identity.context.organizationId);
  const order = await PurchaseOrder.findOne({ _id: id(purchaseOrderId), organizationId }).select("siteId");
  if (!order) throw new AppError("PURCHASE_ORDER_NOT_FOUND", "Purchase order not found.", 404);
  requireSiteAccess(identity, order.siteId.toString());
  const docs = await GoodsReceipt.find({ organizationId, purchaseOrderId: order._id }).sort({ receivedAt: -1, _id: -1 });
  return receiptViews(organizationId, docs);
}

export async function listReceivableOrders(identity: CurrentIdentity, search = "") {
  requirePermission(identity, "inventory.receive");
  await connectToDatabase();
  const organizationId = id(identity.context.organizationId);
  const allowed = hasOrganizationWideSiteAccess(identity) ? null : identity.context.assignedSiteIds.map(id);
  if (allowed?.length === 0) return [];
  const orders = await PurchaseOrder.find({ organizationId, status: { $in: ["ORDERED", "PARTIALLY_RECEIVED"] }, ...(allowed ? { siteId: { $in: allowed } } : {}), ...(search ? { poNumber: { $regex: escaped(search), $options: "i" } } : {}) }).sort({ _id: -1 }).limit(30);
  const views = await receiptViewsForOrders(organizationId, orders);
  return views;
}

async function receiptViewsForOrders(organizationId: mongoose.Types.ObjectId, orders: Array<InstanceType<typeof PurchaseOrder>>) {
  const sites = await Site.find({ organizationId, _id: { $in: orders.map((order) => order.siteId) } }).select("code name");
  const suppliers = await Supplier.find({ organizationId, _id: { $in: orders.map((order) => order.supplierId) } }).select("code name");
  const siteMap = new Map(sites.map((site) => [site._id.toString(), site]));
  const supplierMap = new Map(suppliers.map((supplier) => [supplier._id.toString(), supplier]));
  return orders.map((order) => ({ id: order._id.toString(), poNumber: order.poNumber, status: order.status,
    site: { id: order.siteId.toString(), name: siteMap.get(order.siteId.toString())?.name ?? "Site" },
    supplier: { id: order.supplierId.toString(), name: supplierMap.get(order.supplierId.toString())?.name ?? "Supplier" },
  }));
}

export async function createGoodsReceipt(identity: CurrentIdentity, input: CreateGoodsReceiptInput, key: string): Promise<ReceiptMutationResult> {
  requirePermission(identity, "inventory.receive");
  if (!keyPattern.test(key)) throw new AppError("IDEMPOTENCY_KEY_REQUIRED", "Provide a valid Idempotency-Key header.", 400);
  await connectToDatabase();
  await ready();
  const organizationId = id(identity.context.organizationId);
  const purchaseOrderId = id(input.purchaseOrderId);
  const actorUserId = id(identity.context.userId);
  const scopedOrder = await PurchaseOrder.findOne({ _id: purchaseOrderId, organizationId }).select("siteId");
  if (!scopedOrder) throw new AppError("PURCHASE_ORDER_NOT_FOUND", "Purchase order not found.", 404);
  requireSiteAccess(identity, scopedOrder.siteId.toString());
  const requestHash = fingerprint(input);
  const replay = await previousResult(organizationId, key, "goods_receipt.confirm", requestHash);
  if (replay) return replay;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await mongoose.connection.transaction(async (session) => {
        const order = await PurchaseOrder.findOne({ _id: purchaseOrderId, organizationId }).session(session);
        if (!order || !["ORDERED", "PARTIALLY_RECEIVED"].includes(order.status)) throw new AppError("PURCHASE_ORDER_NOT_RECEIVABLE", "Only ordered purchase orders with outstanding quantity can be received.", 409);
        requireSiteAccess(identity, order.siteId.toString());
        const site = await Site.findOneAndUpdate({ _id: order.siteId, organizationId, status: "ACTIVE", deletedAt: null }, { $inc: { __v: 1 } }, { session });
        if (!site) throw new AppError("SITE_NOT_ACTIVE", "The receiving site must be active.", 409);
        const lineMap = new Map(order.items.map((line) => [line._id.toString(), line]));
        const totals = new Map<string, Decimal>();
        for (const item of input.items) {
          const lineId = item.purchaseOrderItemId.toLowerCase();
          const line = lineMap.get(lineId);
          if (!line || line.materialId.toString() !== item.materialId.toLowerCase()) throw new AppError("INVALID_RECEIPT_LINE", "Receipt lines must match this purchase order.", 422);
          const quantity = new D(item.quantityReceived);
          totals.set(lineId, (totals.get(lineId) ?? zero).plus(quantity));
        }
        for (const [lineId, quantity] of totals) {
          const line = lineMap.get(lineId)!;
          const remaining = new D(line.quantityOrdered.toString()).minus(line.quantityReceived.toString());
          if (quantity.gt(remaining)) throw new AppError("OVER_RECEIPT", "Received quantity exceeds the outstanding purchase order quantity.", 409);
        }
        const materialMap = new Map<string, InstanceType<typeof Material>>();
        for (const materialId of [...new Set(input.items.map((item) => item.materialId.toLowerCase()))].sort()) {
          const material = await Material.findOne({ _id: id(materialId), organizationId, status: "ACTIVE", deletedAt: null }).session(session);
          if (!material) throw new AppError("MATERIAL_NOT_ACTIVE", "A purchase order material is no longer active.", 409);
          const line = input.items.find((item) => item.materialId.toLowerCase() === materialId)!;
          if (lineMap.get(line.purchaseOrderItemId.toLowerCase())?.unit !== material.unit) throw new AppError("MATERIAL_UNIT_CHANGED", "A material unit changed after ordering.", 409);
          const locked = await Material.updateOne({ _id: material._id, organizationId, status: "ACTIVE", deletedAt: null, unit: material.unit, __v: material.__v }, { ...(material.unitLockedAt ? {} : { $set: { unitLockedAt: new Date() } }), $inc: { __v: 1 } }, { session });
          if (locked.matchedCount !== 1) throw new AppError("MATERIAL_CHANGED", "Material details changed. Reload and try again.", 409);
          materialMap.set(materialId, material);
        }
        const receiptId = new mongoose.Types.ObjectId();
        const receiptNumber = `GRN-${new Date().getUTCFullYear()}-${receiptId.toString().slice(-12).toUpperCase()}`;
        const receiptItems: Array<{ purchaseOrderItemId: mongoose.Types.ObjectId; materialId: mongoose.Types.ObjectId; batchId: mongoose.Types.ObjectId; transactionId: mongoose.Types.ObjectId; quantityReceived: mongoose.Types.Decimal128; supplierBatchNumber: string | null; unitCost: mongoose.Types.Decimal128; netAmount: mongoose.Types.Decimal128 }> = [];
        const grouped = new Map<string, { materialId: mongoose.Types.ObjectId; quantity: Decimal; value: Decimal }>();
        let netTotal: Decimal = zero;
        for (const item of input.items) {
          const line = lineMap.get(item.purchaseOrderItemId.toLowerCase())!;
          const material = materialMap.get(item.materialId.toLowerCase())!;
          if (!quantityFitsUnit(item.quantityReceived, material.unit as MaterialUnit, true)) throw new AppError("INVALID_RECEIPT_QUANTITY", `Quantity for ${material.code} does not match its unit.`, 422);
          const quantity = new D(item.quantityReceived);
          const cost = new D(item.unitCost);
          const value = money(quantity.times(cost));
          checkMoney(value);
          netTotal = netTotal.plus(value);
          checkMoney(netTotal);
          const batchId = new mongoose.Types.ObjectId();
          const transactionId = new mongoose.Types.ObjectId();
          receiptItems.push({ purchaseOrderItemId: line._id, materialId: material._id, batchId, transactionId, quantityReceived: stored(quantity), supplierBatchNumber: item.supplierBatchNumber ?? null, unitCost: stored(cost), netAmount: stored(value) });
          const group = grouped.get(material._id.toString()) ?? { materialId: material._id, quantity: zero, value: zero };
          group.quantity = group.quantity.plus(quantity); group.value = group.value.plus(value);
          grouped.set(material._id.toString(), group);
        }
        await GoodsReceipt.create([{ _id: receiptId, organizationId, receiptNumber, purchaseOrderId, siteId: order.siteId, supplierId: order.supplierId, receivedAt: new Date(input.receivedAt), invoiceNumber: input.invoiceNumber ?? null, deliveryChallanNumber: input.deliveryChallanNumber ?? null, notes: input.notes ?? null, items: receiptItems, netTotal: stored(netTotal), receivedBy: actorUserId, status: "CONFIRMED" }], { session });
        for (const item of receiptItems) {
          await InventoryBatch.create([{ _id: item.batchId, organizationId, siteId: order.siteId, materialId: item.materialId, batchCode: `GRN-${item.batchId.toString().slice(-12).toUpperCase()}`, supplierId: order.supplierId, goodsReceiptId: receiptId, receivedAt: new Date(input.receivedAt), initialQuantity: item.quantityReceived, remainingQuantity: item.quantityReceived, reservedQuantity: stored(zero), unitCost: item.unitCost, status: "ACTIVE", version: 0 }], { session });
          await InventoryTransaction.create([{ _id: item.transactionId, organizationId, siteId: order.siteId, materialId: item.materialId, batchId: item.batchId, type: "RECEIPT", quantity: item.quantityReceived, unitCost: item.unitCost, referenceType: "GOODS_RECEIPT", referenceId: receiptId, performedBy: actorUserId }], { session });
        }
        for (const group of grouped.values()) {
          const scope = { organizationId, siteId: order.siteId, materialId: group.materialId };
          const balance = await InventoryBalance.findOne(scope).session(session);
          if (!balance) {
            await InventoryBalance.create([{ ...scope, onHandQuantity: stored(group.quantity), reservedQuantity: stored(zero), availableQuantity: stored(group.quantity), inventoryValue: stored(group.value), version: 1 }], { session });
          } else {
            const nextValue = new D(balance.inventoryValue.toString()).plus(group.value);
            checkMoney(nextValue);
            const result = await InventoryBalance.updateOne({ _id: balance._id, ...scope, version: balance.version }, { $set: { onHandQuantity: stored(new D(balance.onHandQuantity.toString()).plus(group.quantity)), availableQuantity: stored(new D(balance.availableQuantity.toString()).plus(group.quantity)), inventoryValue: stored(nextValue) }, $inc: { version: 1 } }, { session });
            if (result.matchedCount !== 1) throw new AppError("INVENTORY_VERSION_CONFLICT", "Inventory changed. Reload and try again.", 409);
          }
        }
        for (const [lineId, quantity] of totals) {
          const line = lineMap.get(lineId)!;
          line.quantityReceived = stored(new D(line.quantityReceived.toString()).plus(quantity));
        }
        order.status = order.items.every((line) => new D(line.quantityReceived.toString()).eq(line.quantityOrdered.toString())) ? "RECEIVED" : "PARTIALLY_RECEIVED";
        await order.save({ session });
        await recordAudit({ organizationId, actorUserId, action: "goods_receipt.confirmed", entityType: "goods_receipt", entityId: receiptId.toString() }, session);
        const response: ReceiptMutationResult = { id: receiptId.toString(), receiptNumber, status: "CONFIRMED", purchaseOrderId: order._id.toString(), purchaseOrderStatus: order.status };
        await saveIdempotency(organizationId, key, "goods_receipt.confirm", requestHash, response, session);
        return response;
      });
    } catch (error) {
      const committed = await previousResult(organizationId, key, "goods_receipt.confirm", requestHash);
      if (committed) return committed;
      if (isDuplicateKey(error) && attempt < 2) continue;
      if (isDuplicateKey(error)) throw new AppError("RECEIPT_CONFLICT", "Receiving conflicted with another update. Retry shortly.", 409);
      if (error instanceof Error && error.name === "VersionError") throw new AppError("PURCHASE_ORDER_CHANGED", "The purchase order changed. Reload and try again.", 409);
      throw error;
    }
  }
  throw new AppError("RECEIPT_CONFLICT", "Receiving conflicted with another update. Retry shortly.", 409);
}

export async function reverseGoodsReceipt(identity: CurrentIdentity, receiptId: string, reason: string, key: string): Promise<ReceiptMutationResult> {
  requirePermission(identity, "inventory.adjust");
  if (!keyPattern.test(key)) throw new AppError("IDEMPOTENCY_KEY_REQUIRED", "Provide a valid Idempotency-Key header.", 400);
  await connectToDatabase();
  await ready();
  const organizationId = id(identity.context.organizationId);
  const actorUserId = id(identity.context.userId);
  const receiptObjectId = id(receiptId);
  const scopedReceipt = await GoodsReceipt.findOne({ _id: receiptObjectId, organizationId }).select("siteId");
  if (!scopedReceipt) throw new AppError("GOODS_RECEIPT_NOT_FOUND", "Goods receipt not found.", 404);
  requireSiteAccess(identity, scopedReceipt.siteId.toString());
  const requestHash = fingerprint({ receiptId, reason });
  const replay = await previousResult(organizationId, key, "goods_receipt.reverse", requestHash);
  if (replay) return replay;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await mongoose.connection.transaction(async (session) => {
        const receipt = await GoodsReceipt.findOne({ _id: receiptObjectId, organizationId }).session(session);
        if (!receipt || receipt.status !== "CONFIRMED") throw new AppError("RECEIPT_NOT_REVERSIBLE", "This receipt is not eligible for reversal.", 409);
        const order = await PurchaseOrder.findOne({ _id: receipt.purchaseOrderId, organizationId }).session(session);
        if (!order) throw new AppError("PURCHASE_ORDER_NOT_FOUND", "Purchase order not found.", 404);
        const grouped = new Map<string, { materialId: mongoose.Types.ObjectId; quantity: Decimal; value: Decimal }>();
        for (const item of receipt.items) {
          const scope = { organizationId, siteId: receipt.siteId, materialId: item.materialId };
          const batch = await InventoryBatch.findOne({ _id: item.batchId, ...scope, goodsReceiptId: receipt._id }).session(session);
          if (!batch || batch.status !== "ACTIVE" || !new D(batch.remainingQuantity.toString()).eq(batch.initialQuantity.toString()) || !new D(batch.reservedQuantity.toString()).isZero()) {
            throw new AppError("RECEIPT_STOCK_CHANGED", "This receipt's batch stock has been used or reserved. Correct it with an authorized stock adjustment.", 409);
          }
          const updated = await InventoryBatch.updateOne({ _id: batch._id, ...scope, version: batch.version, status: "ACTIVE", remainingQuantity: batch.remainingQuantity, reservedQuantity: batch.reservedQuantity }, { $set: { remainingQuantity: stored(zero), status: "REVERSED" }, $inc: { version: 1 } }, { session });
          if (updated.matchedCount !== 1) throw new AppError("INVENTORY_VERSION_CONFLICT", "A batch changed. Reload and try again.", 409);
          const quantity = new D(item.quantityReceived.toString());
          const value = new D(item.netAmount.toString());
          const group = grouped.get(item.materialId.toString()) ?? { materialId: item.materialId, quantity: zero, value: zero };
          group.quantity = group.quantity.plus(quantity); group.value = group.value.plus(value);
          grouped.set(item.materialId.toString(), group);
          await InventoryTransaction.create([{ organizationId, siteId: receipt.siteId, materialId: item.materialId, batchId: item.batchId, type: "REVERSAL", quantity: stored(quantity.negated()), unitCost: item.unitCost, referenceType: "GOODS_RECEIPT", referenceId: receipt._id, reversalOfTransactionId: item.transactionId, performedBy: actorUserId }], { session });
          const poLine = order.items.find((line) => line._id.toString() === item.purchaseOrderItemId.toString());
          if (!poLine) throw new AppError("INVALID_RECEIPT_LINE", "The purchase order line is unavailable.", 409);
          const nextReceived = new D(poLine.quantityReceived.toString()).minus(quantity);
          if (nextReceived.lt(0)) throw new AppError("INVALID_RECEIPT_LINE", "The purchase order received quantity is inconsistent.", 409);
          poLine.quantityReceived = stored(nextReceived);
        }
        for (const group of grouped.values()) {
          const scope = { organizationId, siteId: receipt.siteId, materialId: group.materialId };
          const balance = await InventoryBalance.findOne(scope).session(session);
          if (!balance) throw new AppError("INVENTORY_VERSION_CONFLICT", "The site balance is unavailable.", 409);
          const onHand = new D(balance.onHandQuantity.toString()).minus(group.quantity);
          const available = new D(balance.availableQuantity.toString()).minus(group.quantity);
          const value = new D(balance.inventoryValue.toString()).minus(group.value);
          if (onHand.lt(0) || available.lt(0) || value.lt(0)) throw new AppError("RECEIPT_STOCK_CHANGED", "Available stock is insufficient to reverse this receipt.", 409);
          const updated = await InventoryBalance.updateOne({ _id: balance._id, ...scope, version: balance.version }, { $set: { onHandQuantity: stored(onHand), availableQuantity: stored(available), inventoryValue: stored(value) }, $inc: { version: 1 } }, { session });
          if (updated.matchedCount !== 1) throw new AppError("INVENTORY_VERSION_CONFLICT", "The site balance changed. Reload and try again.", 409);
        }
        order.status = order.items.every((line) => new D(line.quantityReceived.toString()).isZero()) ? "ORDERED" : "PARTIALLY_RECEIVED";
        await order.save({ session });
        receipt.status = "REVERSED"; receipt.reversedAt = new Date(); receipt.reversedBy = actorUserId; receipt.reversalReason = reason;
        await receipt.save({ session });
        await recordAudit({ organizationId, actorUserId, action: "goods_receipt.reversed", entityType: "goods_receipt", entityId: receipt._id.toString() }, session);
        const response: ReceiptMutationResult = { id: receipt._id.toString(), receiptNumber: receipt.receiptNumber, status: "REVERSED", purchaseOrderId: order._id.toString(), purchaseOrderStatus: order.status };
        await saveIdempotency(organizationId, key, "goods_receipt.reverse", requestHash, response, session);
        return response;
      });
    } catch (error) {
      const committed = await previousResult(organizationId, key, "goods_receipt.reverse", requestHash);
      if (committed) return committed;
      if (isDuplicateKey(error) && attempt < 2) continue;
      if (isDuplicateKey(error)) throw new AppError("RECEIPT_CONFLICT", "Reversal conflicted with another update. Retry shortly.", 409);
      if (error instanceof Error && error.name === "VersionError") throw new AppError("PURCHASE_ORDER_CHANGED", "The purchase order changed. Reload and try again.", 409);
      throw error;
    }
  }
  throw new AppError("RECEIPT_CONFLICT", "Reversal conflicted with another update. Retry shortly.", 409);
}
