import "server-only";
import Decimal from "decimal.js";
import mongoose from "mongoose";
import { listAlertsSchema } from "@/modules/alerts/schemas/alert";
import { listAlerts } from "@/modules/alerts/services/stock-alert-service";
import type { CurrentIdentity } from "@/modules/auth/services/auth-service";
import { Consumption } from "@/modules/consumption/models/consumption";
import { GoodsReceipt } from "@/modules/receiving/models/goods-receipt";
import { InventoryBalance } from "@/modules/inventory/models/inventory-balance";
import { InventoryTransaction } from "@/modules/inventory/models/inventory-transaction";
import { MaterialCategory } from "@/modules/materials/models/category";
import { Material } from "@/modules/materials/models/material";
import { PurchaseOrder } from "@/modules/purchasing/models/purchase-order";
import { Site } from "@/modules/sites/models/site";
import { Supplier } from "@/modules/suppliers/models/supplier";
import { Transfer } from "@/modules/transfers/models/transfer";
import { Wastage } from "@/modules/wastage/models/wastage";
import { hasOrganizationWideSiteAccess } from "@/server/auth/authorize";
import { connectToDatabase } from "@/server/db/connect";
import { AppError } from "@/shared/errors/app-error";
import type { DashboardQuery } from "../schemas/dashboard";
import type { DashboardData } from "../types";

const D = Decimal.clone({ precision: 80 });
type Amount = mongoose.Types.Decimal128;
type SumRow = { _id: null; total: Amount };
type PeriodRow = { _id: string; value: Amount };
const asDecimal = (value: unknown) => new D(value == null ? 0 : String(value));
const money = (value: unknown) => asDecimal(value).toDecimalPlaces(2, D.ROUND_HALF_UP).toFixed(2);
const objectId = (value: string) => new mongoose.Types.ObjectId(value);
const isoDay = (date: Date) => date.toISOString().slice(0, 10);

function bounds(query: DashboardQuery) {
  const now = new Date();
  const to = query.to ?? isoDay(now);
  const from = query.from ?? isoDay(new Date(Date.parse(`${to}T00:00:00.000Z`) - 6 * 86_400_000));
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start > end || end.getTime() - start.getTime() > 366 * 86_400_000) {
    throw new AppError("VALIDATION_ERROR", "Choose a date range of up to one year.", 422);
  }
  const exclusiveEnd = new Date(end.getTime() + 86_400_000);
  return { from, to, start, exclusiveEnd, days: Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1 };
}

function fillPeriods(rows: PeriodRow[], from: string, to: string, monthly: boolean) {
  const values = new Map(rows.map((row) => [row._id, money(row.value)]));
  const result: Array<{ period: string; value: string }> = [];
  let current = new Date(`${monthly ? `${from.slice(0, 7)}-01` : from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  while (current <= end) {
    const period = monthly ? isoDay(current).slice(0, 7) : isoDay(current);
    result.push({ period, value: values.get(period) ?? "0.00" });
    current = new Date(current.getTime() + (monthly ? 0 : 86_400_000));
    if (monthly) current.setUTCMonth(current.getUTCMonth() + 1);
  }
  return result;
}

function transactionHref(referenceType: string, referenceId: mongoose.Types.ObjectId) {
  const root: Record<string, string> = { GOODS_RECEIPT: "goods-receipts", CONSUMPTION: "consumptions", WASTAGE: "wastages", TRANSFER: "transfers" };
  return root[referenceType] ? `/${root[referenceType]}/${referenceId}` : "/inventory";
}

/** Fresh, authorized read model. Inventory balances remain the source of truth for stock value. */
export async function getDashboard(identity: CurrentIdentity, query: DashboardQuery): Promise<DashboardData> {
  await connectToDatabase();
  const organizationId = objectId(identity.context.organizationId);
  const period = bounds(query);
  const assigned = hasOrganizationWideSiteAccess(identity) ? null : identity.context.assignedSiteIds.map(objectId);
  const siteDocuments = await Site.find({ organizationId, status: { $ne: "ARCHIVED" }, deletedAt: null, ...(assigned ? { _id: { $in: assigned } } : {}) })
    .select("code name status location.city").sort({ name: 1 }).lean();
  const sites = siteDocuments.map((site) => ({ id: String(site._id), name: site.name, code: site.code, city: site.location.city, status: site.status }));
  const selectedSiteId = query.siteId?.toLowerCase();
  if (selectedSiteId && !sites.some((site) => site.id === selectedSiteId)) throw new AppError("SITE_NOT_FOUND", "Site not found.", 404);
  const visibleSites = selectedSiteId ? sites.filter((site) => site.id === selectedSiteId) : sites;
  const siteIds = visibleSites.map((site) => objectId(site.id));
  const siteScope = { organizationId, siteId: { $in: siteIds } };
  const transferScope = { organizationId, $or: [{ sourceSiteId: { $in: siteIds } }, { destinationSiteId: { $in: siteIds } }] };
  const range = { $gte: period.start, $lt: period.exclusiveEnd };
  const todayStart = new Date(`${isoDay(new Date())}T00:00:00.000Z`);
  const tomorrow = new Date(todayStart.getTime() + 86_400_000);
  const monthStart = new Date(Date.UTC(todayStart.getUTCFullYear(), todayStart.getUTCMonth(), 1));
  const canApproveOrders = identity.membership.permissions.includes("purchase_order.approve");
  const canApproveTransfers = identity.membership.permissions.includes("transfer.approve");
  const trendMonthly = period.days > 31;
  const periodFormat = trendMonthly ? "%Y-%m" : "%Y-%m-%d";

  const [alertData, siteValues, inventoryDocs, totalMaterials, pendingDeliveryCount, deliveryDocs,
    pendingTransferCount, approvalOrders, approvalTransfers, todayConsumption, monthlyConsumption,
    consumptionTrend, consumptionMonths, purchasingMonths, wastageTotal, receiptTotal,
    wastageMaterials, transactionDocs] = await Promise.all([
    listAlerts(identity, listAlertsSchema.parse({ siteId: query.siteId, limit: 3 })),
    InventoryBalance.aggregate<{ _id: mongoose.Types.ObjectId; value: Amount; materials: mongoose.Types.ObjectId[] }>([
      { $match: siteScope }, { $group: { _id: "$siteId", value: { $sum: "$inventoryValue" }, materials: { $addToSet: "$materialId" } } },
    ]),
    InventoryBalance.find(siteScope).select("siteId materialId onHandQuantity reservedQuantity availableQuantity inventoryValue")
      .sort({ inventoryValue: -1, _id: -1 }).limit(6).lean(),
    hasOrganizationWideSiteAccess(identity)
      ? Material.countDocuments({ organizationId, status: "ACTIVE", deletedAt: null })
      : InventoryBalance.distinct("materialId", siteScope).then((ids) => Material.countDocuments({ organizationId, _id: { $in: ids }, status: "ACTIVE", deletedAt: null })),
    PurchaseOrder.countDocuments({ ...siteScope, status: { $in: ["ORDERED", "PARTIALLY_RECEIVED"] } }),
    PurchaseOrder.find({ ...siteScope, status: { $in: ["ORDERED", "PARTIALLY_RECEIVED"] } })
      .select("poNumber siteId supplierId status expectedDeliveryDate items").sort({ expectedDeliveryDate: 1, _id: -1 }).limit(4).lean(),
    Transfer.countDocuments({ ...transferScope, status: { $in: ["REQUESTED", "APPROVED", "DISPATCHED"] } }),
    canApproveOrders ? PurchaseOrder.find({ ...siteScope, status: "PENDING_APPROVAL" })
      .select("poNumber siteId grandTotal createdAt").sort({ _id: -1 }).limit(3).lean() : Promise.resolve([]),
    canApproveTransfers ? Transfer.find({ ...transferScope, status: "REQUESTED" })
      .select("transferNumber sourceSiteId destinationSiteId materialId quantity requestedAt").sort({ _id: -1 }).limit(3).lean() : Promise.resolve([]),
    Consumption.aggregate<SumRow>([{ $match: { ...siteScope, status: "CONFIRMED", issuedAt: { $gte: todayStart, $lt: tomorrow } } }, { $group: { _id: null, total: { $sum: "$valueRemoved" } } }]),
    Consumption.aggregate<SumRow>([{ $match: { ...siteScope, status: "CONFIRMED", issuedAt: { $gte: monthStart, $lt: tomorrow } } }, { $group: { _id: null, total: { $sum: "$valueRemoved" } } }]),
    Consumption.aggregate<PeriodRow>([{ $match: { ...siteScope, status: "CONFIRMED", issuedAt: range } }, { $group: { _id: { $dateToString: { format: periodFormat, date: "$issuedAt", timezone: "UTC" } }, value: { $sum: "$valueRemoved" } } }, { $sort: { _id: 1 } }]),
    Consumption.aggregate<PeriodRow>([{ $match: { ...siteScope, status: "CONFIRMED", issuedAt: range } }, { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$issuedAt", timezone: "UTC" } }, value: { $sum: "$valueRemoved" } } }, { $sort: { _id: 1 } }]),
    PurchaseOrder.aggregate<PeriodRow>([{ $match: { ...siteScope, status: { $in: ["ORDERED", "PARTIALLY_RECEIVED", "RECEIVED"] }, orderedAt: range } }, { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$orderedAt", timezone: "UTC" } }, value: { $sum: "$grandTotal" } } }, { $sort: { _id: 1 } }]),
    Wastage.aggregate<SumRow>([{ $match: { ...siteScope, status: "CONFIRMED", wastedAt: range } }, { $group: { _id: null, total: { $sum: "$valueRemoved" } } }]),
    GoodsReceipt.aggregate<SumRow>([{ $match: { ...siteScope, status: "CONFIRMED", receivedAt: range } }, { $group: { _id: null, total: { $sum: "$netTotal" } } }]),
    Wastage.aggregate<{ _id: mongoose.Types.ObjectId; value: Amount }>([{ $match: { ...siteScope, status: "CONFIRMED", wastedAt: range } }, { $group: { _id: "$materialId", value: { $sum: "$valueRemoved" } } }]),
    InventoryTransaction.find({ ...siteScope, createdAt: range }).select("siteId materialId type quantity referenceType referenceId createdAt")
      .sort({ createdAt: -1, _id: -1 }).limit(6).lean(),
  ]);

  const siteMap = new Map(sites.map((site) => [site.id, site]));
  const materialIds = [...new Set([
    ...inventoryDocs.map((row) => String(row.materialId)),
    ...approvalTransfers.map((row) => String(row.materialId)),
    ...transactionDocs.map((row) => String(row.materialId)),
    ...wastageMaterials.map((row) => String(row._id)),
  ])].map(objectId);
  const supplierIds = [...new Set(deliveryDocs.map((row) => String(row.supplierId)))].map(objectId);
  const [materials, suppliers] = await Promise.all([
    Material.find({ organizationId, _id: { $in: materialIds } }).select("name code unit categoryId").lean(),
    Supplier.find({ organizationId, _id: { $in: supplierIds } }).select("name").lean(),
  ]);
  const materialMap = new Map(materials.map((material) => [String(material._id), material]));
  const supplierMap = new Map(suppliers.map((supplier) => [String(supplier._id), supplier.name]));
  const categoryIds = [...new Set(materials.filter((material) => wastageMaterials.some((row) => String(row._id) === String(material._id))).map((material) => String(material.categoryId)))].map(objectId);
  const categories = await MaterialCategory.find({ organizationId, _id: { $in: categoryIds } }).select("name").lean();
  const categoryMap = new Map(categories.map((category) => [String(category._id), category.name]));
  const categoryValues = new Map<string, Decimal>();
  for (const row of wastageMaterials) {
    const material = materialMap.get(String(row._id));
    const name = material ? categoryMap.get(String(material.categoryId)) ?? "Other" : "Other";
    categoryValues.set(name, (categoryValues.get(name) ?? new D(0)).plus(asDecimal(row.value)));
  }
  const valueBySite = new Map(siteValues.map((row) => [String(row._id), row]));
  const inventoryValue = siteValues.reduce((sum, row) => sum.plus(asDecimal(row.value)), new D(0));
  const wasteValue = asDecimal(wastageTotal[0]?.total);
  const receivedValue = asDecimal(receiptTotal[0]?.total);
  const approvals: DashboardData["approvals"] = [
    ...approvalOrders.map((order) => ({ id: String(order._id), kind: "PURCHASE_ORDER" as const, number: order.poNumber, site: siteMap.get(String(order.siteId))?.name ?? "Site", description: "Purchase order awaiting approval", value: money(order.grandTotal), href: `/purchase-orders/${order._id}` })),
    ...approvalTransfers.map((transfer) => ({ id: String(transfer._id), kind: "TRANSFER" as const, number: transfer.transferNumber, site: siteMap.get(String(transfer.sourceSiteId))?.name ?? "Site", description: `${materialMap.get(String(transfer.materialId))?.name ?? "Material"} · ${transfer.quantity} ${materialMap.get(String(transfer.materialId))?.unit ?? ""}`, value: null, href: `/transfers/${transfer._id}` })),
  ].slice(0, 4);

  return {
    filters: { siteId: selectedSiteId ?? null, from: period.from, to: period.to, periodLabel: `${period.from} to ${period.to} · UTC` },
    sites,
    currencyCode: identity.organization.currencyCode,
    metrics: {
      activeSites: visibleSites.filter((site) => site.status === "ACTIVE").length,
      totalMaterials,
      inventoryValue: money(inventoryValue),
      lowStockItems: alertData.summary.lowStock,
      outOfStockItems: alertData.summary.outOfStock,
      pendingDeliveries: pendingDeliveryCount,
      todayConsumptionValue: money(todayConsumption[0]?.total),
      monthlyConsumptionValue: money(monthlyConsumption[0]?.total),
      wastagePercentage: receivedValue.gt(0) ? wasteValue.div(receivedValue).mul(100).toFixed(2) : null,
      pendingTransfers: pendingTransferCount,
    },
    charts: {
      trendGrouping: trendMonthly ? "month" : "day",
      consumptionTrend: fillPeriods(consumptionTrend, period.from, period.to, trendMonthly),
      monthlyConsumption: fillPeriods(consumptionMonths, period.from, period.to, true),
      monthlyPurchasing: fillPeriods(purchasingMonths, period.from, period.to, true),
      wastageByCategory: [...categoryValues].map(([category, value]) => ({ category, value: money(value) })).sort((a, b) => new D(b.value).cmp(a.value)),
      inventoryValueBySite: visibleSites.map((site) => ({ siteId: site.id, site: site.name, value: money(valueBySite.get(site.id)?.value), materialCount: valueBySite.get(site.id)?.materials.length ?? 0 })),
    },
    inventory: inventoryDocs.map((row) => {
      const material = materialMap.get(String(row.materialId));
      return { id: String(row._id), siteId: String(row.siteId), site: siteMap.get(String(row.siteId))?.name ?? "Site", material: material?.name ?? "Material", code: material?.code ?? "", unit: material?.unit ?? "", onHand: String(row.onHandQuantity), reserved: String(row.reservedQuantity), available: String(row.availableQuantity), value: money(row.inventoryValue) };
    }),
    approvals,
    pendingDeliveries: deliveryDocs.map((order) => ({ id: String(order._id), number: order.poNumber, site: siteMap.get(String(order.siteId))?.name ?? "Site", supplier: supplierMap.get(String(order.supplierId)) ?? "Supplier", status: order.status, expectedDate: order.expectedDeliveryDate?.toISOString() ?? null, href: `/purchase-orders/${order._id}` })),
    recentTransactions: transactionDocs.map((transaction) => ({ id: String(transaction._id), type: transaction.type, material: materialMap.get(String(transaction.materialId))?.name ?? "Material", site: siteMap.get(String(transaction.siteId))?.name ?? "Site", quantity: String(transaction.quantity), unit: materialMap.get(String(transaction.materialId))?.unit ?? "", createdAt: transaction.createdAt.toISOString(), href: transactionHref(transaction.referenceType, transaction.referenceId) })),
    alerts: alertData.alerts,
    alertSummary: alertData.summary,
  };
}
