import "server-only";
import Decimal from "decimal.js";
import mongoose from "mongoose";
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
import { Wastage } from "@/modules/wastage/models/wastage";
import { hasOrganizationWideSiteAccess, requirePermission, requireSiteAccess } from "@/server/auth/authorize";
import { connectToDatabase } from "@/server/db/connect";
import { AppError } from "@/shared/errors/app-error";
import type { ReportKind, ReportQuery } from "../schemas/report";
import type { ReportData } from "../types";

const D = Decimal.clone({ precision: 80 });
const oid = (value: string) => new mongoose.Types.ObjectId(value);
const day = (value: Date) => value.toISOString().slice(0, 10);
const amount = (value: unknown) => new D(value == null ? 0 : String(value));
const money = (value: unknown) => amount(value).toDecimalPlaces(2, D.ROUND_HALF_UP).toFixed(2);
const date = (value: Date) => value.toISOString().slice(0, 10);
const maxRows = 2000;

function dateBounds(query: ReportQuery) {
  const to = query.to ?? day(new Date());
  const from = query.from ?? day(new Date(Date.parse(`${to}T00:00:00.000Z`) - 29 * 86_400_000));
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start > end || end.getTime() - start.getTime() > 366 * 86_400_000) throw new AppError("VALIDATION_ERROR", "Choose a date range of up to one year.", 422);
  return { from, to, range: { $gte: start, $lt: new Date(end.getTime() + 86_400_000) } };
}

function bounded<T>(rows: T[]): T[] {
  if (rows.length > maxRows) throw new AppError("REPORT_TOO_LARGE", "Narrow the report filters before viewing or exporting.", 422);
  return rows;
}

export async function getReportOptions(identity: CurrentIdentity) {
  requirePermission(identity, "reports.view");
  await connectToDatabase();
  const organizationId = oid(identity.context.organizationId);
  const allowed = hasOrganizationWideSiteAccess(identity) ? null : identity.context.assignedSiteIds.map(oid);
  const [sites, materials, categories, suppliers] = await Promise.all([
    Site.find({ organizationId, deletedAt: null, ...(allowed ? { _id: { $in: allowed } } : {}) }).select("name code").sort({ name: 1 }).lean(),
    Material.find({ organizationId, deletedAt: null }).select("name code").sort({ name: 1 }).lean(),
    MaterialCategory.find({ organizationId, deletedAt: null }).select("name").sort({ name: 1 }).lean(),
    Supplier.find({ organizationId, deletedAt: null }).select("name code").sort({ name: 1 }).lean(),
  ]);
  const map = (values: Array<{ _id: mongoose.Types.ObjectId; name: string; code?: string }>) => values.map((value) => ({ id: value._id.toString(), name: value.name, code: value.code ?? "" }));
  return { sites: map(sites), materials: map(materials), categories: map(categories), suppliers: map(suppliers) };
}

export async function getReport(identity: CurrentIdentity, kind: ReportKind, query: ReportQuery): Promise<ReportData> {
  requirePermission(identity, "reports.view");
  await connectToDatabase();
  const organizationId = oid(identity.context.organizationId);
  const period = dateBounds(query);
  if (query.supplierId && !["purchases", "suppliers"].includes(kind)) throw new AppError("VALIDATION_ERROR", "Supplier filter is available only for purchasing reports.", 422);
  if (query.siteId) requireSiteAccess(identity, query.siteId);
  if (kind === "sites" && !query.siteId) throw new AppError("VALIDATION_ERROR", "Select a site for the site report.", 422);
  const assigned = hasOrganizationWideSiteAccess(identity) ? null : identity.context.assignedSiteIds.map(oid);
  const siteIds = query.siteId ? [oid(query.siteId)] : assigned;
  if (query.siteId && !await Site.exists({ _id: oid(query.siteId), organizationId })) throw new AppError("SITE_NOT_FOUND", "Site not found.", 404);
  const siteFilter = siteIds ? { siteId: { $in: siteIds } } : {};
  const [sites, materials, categories, suppliers] = await Promise.all([
    Site.find({ organizationId, ...(siteIds ? { _id: { $in: siteIds } } : {}) }).select("name code").lean(),
    Material.find({ organizationId, ...(query.materialId ? { _id: oid(query.materialId) } : {}), ...(query.categoryId ? { categoryId: oid(query.categoryId) } : {}) }).select("name code unit categoryId").lean(),
    MaterialCategory.find({ organizationId }).select("name").lean(),
    Supplier.find({ organizationId, ...(query.supplierId ? { _id: oid(query.supplierId) } : {}) }).select("name code").lean(),
  ]);
  const siteMap = new Map(sites.map((site) => [String(site._id), site.name]));
  const materialMap = new Map(materials.map((material) => [String(material._id), material]));
  const categoryMap = new Map(categories.map((category) => [String(category._id), category.name]));
  const supplierMap = new Map(suppliers.map((supplier) => [String(supplier._id), supplier.name]));
  const materialFilter = query.materialId || query.categoryId ? { materialId: { $in: materials.map((material) => material._id) } } : {};
  const supplierFilter = query.supplierId ? { supplierId: oid(query.supplierId) } : {};
  const base = { organizationId, ...siteFilter };
  let title = "";
  let columns: string[] = [];
  let rows: string[][] = [];
  let summary: ReportData["summary"] = [];

  if (kind === "inventory") {
    title = "Current inventory";
    columns = ["Site", "Material", "Category", "Unit", "On hand", "Reserved", "Available", `Value (${identity.organization.currencyCode})`];
    const balances = bounded(await InventoryBalance.find({ ...base, ...materialFilter }).sort({ siteId: 1, materialId: 1 }).limit(maxRows + 1).lean());
    rows = balances.map((balance) => { const material = materialMap.get(String(balance.materialId)); return [siteMap.get(String(balance.siteId)) ?? "Former site", material?.name ?? "Former material", material ? categoryMap.get(String(material.categoryId)) ?? "Other" : "Other", material?.unit ?? "", String(balance.onHandQuantity), String(balance.reservedQuantity), String(balance.availableQuantity), money(balance.inventoryValue)]; });
    summary = [{ label: "Stock lines", value: String(rows.length) }, { label: "Inventory value", value: `${identity.organization.currencyCode} ${money(balances.reduce((sum, row) => sum.plus(amount(row.inventoryValue)), new D(0)))}` }];
  } else if (kind === "purchases" || kind === "suppliers") {
    const orders = bounded(await PurchaseOrder.find({ ...base, ...supplierFilter, status: { $in: ["ORDERED", "PARTIALLY_RECEIVED", "RECEIVED"] }, orderedAt: period.range, ...(query.materialId || query.categoryId ? { "items.materialId": { $in: materials.map((material) => material._id) } } : {}) }).sort({ orderedAt: -1, _id: -1 }).limit(maxRows + 1).lean());
    if (kind === "purchases") {
      title = "Purchase history";
      columns = ["Ordered", "Purchase order", "Site", "Supplier", "Material", "Quantity", "Unit", `Line total (${identity.organization.currencyCode})`, "Status"];
      rows = bounded(orders.flatMap((order) => order.items.filter((item) => !query.materialId && !query.categoryId || materialMap.has(String(item.materialId))).map((item) => [date(order.orderedAt!), order.poNumber, siteMap.get(String(order.siteId)) ?? "Former site", supplierMap.get(String(order.supplierId)) ?? "Former supplier", materialMap.get(String(item.materialId))?.name ?? "Former material", String(item.quantityOrdered), item.unit, money(item.grandTotal), order.status])));
      summary = [{ label: "Purchase lines", value: String(rows.length) }, { label: "Line total", value: `${identity.organization.currencyCode} ${money(rows.reduce((sum, row) => sum.plus(row[7]), new D(0)))}` }];
    } else {
      title = "Supplier spend";
      columns = ["Supplier", "Orders", `Purchase value (${identity.organization.currencyCode})`, "Materials supplied"];
      const bySupplier = new Map<string, { orders: number; value: Decimal; materials: Set<string> }>();
      for (const order of orders) { const key = String(order.supplierId); const current = bySupplier.get(key) ?? { orders: 0, value: new D(0), materials: new Set<string>() }; current.orders++; for (const item of order.items) if (!query.materialId && !query.categoryId || materialMap.has(String(item.materialId))) { current.value = current.value.plus(amount(item.grandTotal)); current.materials.add(String(item.materialId)); } bySupplier.set(key, current); }
      rows = [...bySupplier].map(([key, value]) => [supplierMap.get(key) ?? "Former supplier", String(value.orders), money(value.value), String(value.materials.size)]);
      summary = [{ label: "Suppliers", value: String(rows.length) }, { label: "Purchase value", value: `${identity.organization.currencyCode} ${money(rows.reduce((sum, row) => sum.plus(row[2]), new D(0)))}` }];
    }
  } else if (kind === "consumption") {
    title = "Material consumption";
    columns = ["Issued", "Site", "Material", "Activity", "Issued to", "Quantity", "Unit", `Value (${identity.organization.currencyCode})`];
    const records = bounded(await Consumption.find({ ...base, ...materialFilter, status: "CONFIRMED", issuedAt: period.range }).sort({ issuedAt: -1, _id: -1 }).limit(maxRows + 1).lean());
    rows = records.map((record) => [date(record.issuedAt), siteMap.get(String(record.siteId)) ?? "Former site", materialMap.get(String(record.materialId))?.name ?? "Former material", record.activity, record.issuedTo, String(record.quantity), materialMap.get(String(record.materialId))?.unit ?? "", money(record.valueRemoved)]);
    summary = [{ label: "Issues", value: String(rows.length) }, { label: "Issued value", value: `${identity.organization.currencyCode} ${money(records.reduce((sum, row) => sum.plus(amount(row.valueRemoved)), new D(0)))}` }];
  } else if (kind === "wastage") {
    title = "Material wastage";
    columns = ["Wasted", "Site", "Material", "Reason", "Quantity", "Unit", `Loss value (${identity.organization.currencyCode})`];
    const records = bounded(await Wastage.find({ ...base, ...materialFilter, status: "CONFIRMED", wastedAt: period.range }).sort({ wastedAt: -1, _id: -1 }).limit(maxRows + 1).lean());
    rows = records.map((record) => [date(record.wastedAt), siteMap.get(String(record.siteId)) ?? "Former site", materialMap.get(String(record.materialId))?.name ?? "Former material", record.reason.replaceAll("_", " "), String(record.quantity), materialMap.get(String(record.materialId))?.unit ?? "", money(record.valueRemoved)]);
    const received = await GoodsReceipt.aggregate<{ _id: null; total: mongoose.Types.Decimal128 }>([
      { $match: { ...base, status: "CONFIRMED", receivedAt: period.range } },
      ...(query.materialId || query.categoryId ? [{ $unwind: "$items" }, { $match: { "items.materialId": { $in: materials.map((material) => material._id) } } }, { $group: { _id: null, total: { $sum: "$items.netAmount" } } }] : [{ $group: { _id: null, total: { $sum: "$netTotal" } } }]),
    ]);
    const lost = records.reduce((sum, row) => sum.plus(amount(row.valueRemoved)), new D(0));
    summary = [{ label: "Loss records", value: String(rows.length) }, { label: "Loss value", value: `${identity.organization.currencyCode} ${money(lost)}` }, { label: "Loss / receipts", value: amount(received[0]?.total).gt(0) ? `${lost.div(amount(received[0].total)).mul(100).toFixed(2)}%` : "—" }];
  } else {
    title = `Site activity · ${siteMap.get(query.siteId!) ?? "Site"}`;
    columns = ["Date", "Type", "Material", "Quantity", "Unit", "Reference"];
    const records = bounded(await InventoryTransaction.find({ ...base, ...materialFilter, createdAt: period.range }).sort({ createdAt: -1, _id: -1 }).limit(maxRows + 1).lean());
    rows = records.map((record) => [record.createdAt.toISOString(), record.type.replaceAll("_", " "), materialMap.get(String(record.materialId))?.name ?? "Former material", String(record.quantity), materialMap.get(String(record.materialId))?.unit ?? "", record.referenceId.toString()]);
    summary = [{ label: "Movements", value: String(rows.length) }];
  }
  return { kind, title, columns, rows, totalRows: rows.length, summary, filters: { from: period.from, to: period.to, siteId: query.siteId ?? null, materialId: query.materialId ?? null, categoryId: query.categoryId ?? null, supplierId: query.supplierId ?? null }, currencyCode: identity.organization.currencyCode };
}
