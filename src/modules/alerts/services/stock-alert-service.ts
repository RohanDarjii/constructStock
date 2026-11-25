import "server-only";
import Decimal from "decimal.js";
import mongoose from "mongoose";
import { ensureAuditReady, recordAudit } from "@/modules/audit/services/record-audit";
import { User } from "@/modules/auth/models/identity";
import { isDuplicateKey } from "@/modules/auth/services/security";
import type { CurrentIdentity } from "@/modules/auth/services/auth-service";
import { InventoryBalance } from "@/modules/inventory/models/inventory-balance";
import { InventoryTransaction } from "@/modules/inventory/models/inventory-transaction";
import { Material } from "@/modules/materials/models/material";
import type { MaterialUnit } from "@/modules/materials/types";
import { PurchaseOrder } from "@/modules/purchasing/models/purchase-order";
import { Site } from "@/modules/sites/models/site";
import { hasOrganizationWideSiteAccess, requirePermission, requireSiteAccess } from "@/server/auth/authorize";
import { connectToDatabase } from "@/server/db/connect";
import { AppError } from "@/shared/errors/app-error";
import { Alert } from "../models/alert";
import { AlertInitialization } from "../models/alert-initialization";
import type { ListAlertsQuery } from "../schemas/alert";
import type { AlertSummary, AlertView } from "../types";

type Scope = { organizationId: mongoose.Types.ObjectId; siteId: mongoose.Types.ObjectId; materialId: mongoose.Types.ObjectId };
type AlertDocument = InstanceType<typeof Alert>;
const D = Decimal.clone({ precision: 80 });
const stored = (value: string | Decimal) => mongoose.Types.Decimal128.fromString(new D(value).toString());
const oid = (value: string) => {
  if (!/^[a-fA-F0-9]{24}$/.test(value)) throw new AppError("ALERT_NOT_FOUND", "Alert not found.", 404);
  return new mongoose.Types.ObjectId(value);
};
const escaped = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const conditionKey = (scope: Scope) => `STOCK:${scope.siteId}:${scope.materialId}`;
const activeStatuses = ["OPEN", "ACKNOWLEDGED"] as const;

export async function ensureStockAlertsReady() { await Alert.init(); }

/** One-time reconciliation of balances that existed before alert writes were deployed. */
async function initializeHistoricalAlerts(organizationId: mongoose.Types.ObjectId): Promise<void> {
  if (await AlertInitialization.exists({ organizationId })) return;
  await Promise.all([AlertInitialization.init(), ensureStockAlertsReady()]);
  const balances = await InventoryBalance.find({ organizationId }).select("siteId materialId availableQuantity version");
  const materialIds = [...new Set(balances.map((balance) => balance.materialId.toString()))].map(oid);
  const siteIds = [...new Set(balances.map((balance) => balance.siteId.toString()))].map(oid);
  const [materials, sites, activeAlerts] = await Promise.all([
    Material.find({ organizationId, _id: { $in: materialIds }, status: "ACTIVE", deletedAt: null }).select("minimumStockLevel"),
    Site.find({ organizationId, _id: { $in: siteIds }, status: "ACTIVE", deletedAt: null }).select("_id"),
    Alert.find({ organizationId, resolvedAt: null }).select("conditionKey"),
  ]);
  const minimumByMaterial = new Map(materials.map((material) => [material._id.toString(), new D(material.minimumStockLevel.toString())]));
  const activeSiteIds = new Set(sites.map((site) => site._id.toString()));
  const existingConditions = new Set(activeAlerts.map((alert) => alert.conditionKey));
  for (const balance of balances) {
    const minimum = minimumByMaterial.get(balance.materialId.toString());
    const scope = { organizationId, siteId: balance.siteId, materialId: balance.materialId };
    if (!minimum || !activeSiteIds.has(balance.siteId.toString()) || existingConditions.has(conditionKey(scope)) || new D(balance.availableQuantity.toString()).gt(minimum)) continue;
    try {
      await mongoose.connection.transaction(async (session) => {
        // Serialize the scan with inventory writers so it cannot publish a stale threshold snapshot.
        const locked = await InventoryBalance.updateOne({ _id: balance._id, organizationId, version: balance.version }, { $inc: { version: 1 } }, { session });
        if (locked.matchedCount === 1) await reconcileStockAlert(scope, session, "EXISTING_BALANCE_SCAN");
      });
    }
    catch (error) { if (!isDuplicateKey(error)) throw error; }
  }
  try { await AlertInitialization.create({ organizationId, completedAt: new Date() }); }
  catch (error) { if (!isDuplicateKey(error)) throw error; }
}

/** Called inside the inventory transaction after its balance write. */
export async function reconcileStockAlert(scope: Scope, session: mongoose.ClientSession, triggerSource: string): Promise<void> {
  // A MongoDB session cannot safely run parallel operations within one transaction.
  const balance = await InventoryBalance.findOne(scope).session(session);
  const material = await Material.findOne({ _id: scope.materialId, organizationId: scope.organizationId }).select("name unit minimumStockLevel status deletedAt").session(session);
  const site = await Site.findOne({ _id: scope.siteId, organizationId: scope.organizationId }).select("name status deletedAt").session(session);
  const alert = await Alert.findOne({ organizationId: scope.organizationId, conditionKey: conditionKey(scope), resolvedAt: null }).session(session);
  const valid = Boolean(balance && material?.status === "ACTIVE" && !material.deletedAt && site?.status === "ACTIVE" && !site.deletedAt);
  const available = new D(balance?.availableQuantity.toString() ?? "0");
  const minimum = new D(material?.minimumStockLevel.toString() ?? "0");
  const unhealthy = valid && available.lte(minimum);
  const now = new Date();
  if (!unhealthy) {
    if (!alert) return;
    alert.status = "RESOLVED";
    alert.resolvedAt = now;
    alert.resolutionReason = valid ? "STOCK_RECOVERED" : "RECORD_ARCHIVED";
    if (balance) {
      alert.availableQuantity = balance.availableQuantity;
      alert.onHandQuantity = balance.onHandQuantity;
      alert.reservedQuantity = balance.reservedQuantity;
    }
    if (material) alert.minimumQuantity = material.minimumStockLevel;
    alert.history.push({ event: "RESOLVED", at: now, actorUserId: null, note: null, availableQuantity: stored(available), minimumQuantity: stored(minimum) });
    await alert.save({ session });
    return;
  }
  if (!balance || !material || !site) throw new AppError("ALERT_REFERENCE_MISSING", "Stock alert references are unavailable.", 500);
  const type = available.isZero() ? "OUT_OF_STOCK" : "LOW_STOCK";
  const severity = type === "OUT_OF_STOCK" ? "CRITICAL" : "WARNING";
  const title = `${type === "OUT_OF_STOCK" ? "Out of stock" : "Low stock"} — ${material.name}`;
  const message = `${material.name} at ${site.name} has ${available.toString()} ${material.unit} available against a minimum of ${minimum.toString()} ${material.unit}.`;
  if (!alert) {
    const id = new mongoose.Types.ObjectId();
    await Alert.create([{ _id: id, ...scope, conditionKey: conditionKey(scope), alertNumber: `ALT-${now.getUTCFullYear()}-${id.toString().slice(-12).toUpperCase()}`, type, severity, status: "OPEN", title, message,
      availableQuantity: balance.availableQuantity, onHandQuantity: balance.onHandQuantity, reservedQuantity: balance.reservedQuantity, minimumQuantity: material.minimumStockLevel,
      triggerSource, triggeredAt: now, history: [{ event: "TRIGGERED", at: now, actorUserId: null, note: triggerSource, availableQuantity: balance.availableQuantity, minimumQuantity: material.minimumStockLevel }] }], { session });
    return;
  }
  const oldType = alert.type;
  alert.type = type; alert.severity = severity; alert.title = title; alert.message = message;
  alert.availableQuantity = balance.availableQuantity; alert.onHandQuantity = balance.onHandQuantity;
  alert.reservedQuantity = balance.reservedQuantity; alert.minimumQuantity = material.minimumStockLevel;
  if (oldType !== type) {
    alert.triggerSource = triggerSource;
    alert.history.push({ event: type === "OUT_OF_STOCK" ? "ESCALATED" : "DEESCALATED", at: now, actorUserId: null, note: triggerSource, availableQuantity: balance.availableQuantity, minimumQuantity: material.minimumStockLevel });
    if (type === "OUT_OF_STOCK") {
      alert.status = "OPEN";
      alert.acknowledgedAt = null; alert.acknowledgedBy = null; alert.acknowledgmentNote = null;
    }
  }
  await alert.save({ session });
}

export async function reconcileMaterialStockAlerts(organizationId: mongoose.Types.ObjectId, materialId: mongoose.Types.ObjectId, session: mongoose.ClientSession, triggerSource: string) {
  const balances = await InventoryBalance.find({ organizationId, materialId }).select("siteId").session(session);
  for (const balance of balances) await reconcileStockAlert({ organizationId, siteId: balance.siteId, materialId }, session, triggerSource);
}

export async function reconcileSiteStockAlerts(organizationId: mongoose.Types.ObjectId, siteId: mongoose.Types.ObjectId, session: mongoose.ClientSession, triggerSource: string) {
  const balances = await InventoryBalance.find({ organizationId, siteId }).select("materialId").session(session);
  for (const balance of balances) await reconcileStockAlert({ organizationId, siteId, materialId: balance.materialId }, session, triggerSource);
}

function visibleScope(identity: CurrentIdentity) {
  requirePermission(identity, "inventory.view");
  const organizationId = oid(identity.context.organizationId);
  const allowed = hasOrganizationWideSiteAccess(identity) ? null : identity.context.assignedSiteIds.map(oid);
  return { organizationId, allowed };
}

async function views(organizationId: mongoose.Types.ObjectId, alerts: AlertDocument[]): Promise<AlertView[]> {
  if (!alerts.length) return [];
  const ids = (values: string[]) => [...new Set(values)].map(oid);
  const [sites, materials, users] = await Promise.all([
    Site.find({ organizationId, _id: { $in: ids(alerts.map((alert) => alert.siteId.toString())) } }).select("code name"),
    Material.find({ organizationId, _id: { $in: ids(alerts.map((alert) => alert.materialId.toString())) } }).select("code name unit"),
    User.find({ _id: { $in: ids(alerts.flatMap((alert) => [alert.acknowledgedBy, ...alert.history.map((event) => event.actorUserId)].filter(Boolean).map(String))) } }).select("name"),
  ]);
  const siteMap = new Map(sites.map((site) => [site._id.toString(), site]));
  const materialMap = new Map(materials.map((material) => [material._id.toString(), material]));
  const userMap = new Map(users.map((user) => [user._id.toString(), user.name]));
  const actor = (value: mongoose.Types.ObjectId | null | undefined) => value ? { id: value.toString(), name: userMap.get(value.toString()) ?? "Former member" } : null;
  return alerts.map((alert) => {
    const site = siteMap.get(alert.siteId.toString());
    const material = materialMap.get(alert.materialId.toString());
    if (!site || !material) throw new AppError("ALERT_REFERENCE_MISSING", "Alert references are unavailable.", 500);
    return {
      id: alert._id.toString(), alertNumber: alert.alertNumber,
      type: alert.type as AlertView["type"], severity: alert.severity as AlertView["severity"], status: alert.status as AlertView["status"],
      site: { id: site._id.toString(), code: site.code, name: site.name },
      material: { id: material._id.toString(), code: material.code, name: material.name, unit: material.unit as MaterialUnit },
      title: alert.title, message: alert.message, available: alert.availableQuantity.toString(), onHand: alert.onHandQuantity.toString(), reserved: alert.reservedQuantity.toString(), minimum: alert.minimumQuantity.toString(),
      triggerSource: alert.triggerSource, triggeredAt: alert.triggeredAt.toISOString(), updatedAt: alert.updatedAt.toISOString(),
      acknowledgedAt: alert.acknowledgedAt?.toISOString() ?? null, acknowledgedBy: actor(alert.acknowledgedBy), acknowledgmentNote: alert.acknowledgmentNote ?? null,
      resolvedAt: alert.resolvedAt?.toISOString() ?? null, resolutionReason: alert.resolutionReason ?? null,
      history: alert.history.map((event) => ({ event: event.event, at: event.at.toISOString(), actor: actor(event.actorUserId), note: event.note ?? null, available: event.availableQuantity.toString(), minimum: event.minimumQuantity.toString() })),
    };
  });
}

export async function listAlerts(identity: CurrentIdentity, query: ListAlertsQuery) {
  const { organizationId, allowed } = visibleScope(identity);
  if (query.siteId) requireSiteAccess(identity, query.siteId);
  await connectToDatabase();
  await initializeHistoricalAlerts(organizationId);
  const search = query.q ? { $regex: escaped(query.q), $options: "i" } : null;
  const [matchingSites, matchingMaterials] = search ? await Promise.all([
    Site.find({ organizationId, $or: [{ name: search }, { code: search }] }).select("_id"),
    Material.find({ organizationId, $or: [{ name: search }, { code: search }] }).select("_id"),
  ]) : [[], []];
  const base = {
    organizationId, ...(allowed ? { siteId: { $in: allowed } } : {}),
    ...(query.siteId ? { siteId: oid(query.siteId) } : {}),
    ...(query.materialId ? { materialId: oid(query.materialId) } : {}),
    ...(query.severity ? { severity: query.severity } : {}),
    ...(search ? { $or: [{ alertNumber: search }, { siteId: { $in: matchingSites.map((site) => site._id) } }, { materialId: { $in: matchingMaterials.map((material) => material._id) } }] } : {}),
  };
  const filter = { ...base, ...(query.status ? { status: query.status } : { status: { $in: activeStatuses } }), ...(query.type ? { type: query.type } : {}), ...(query.cursor ? { _id: { $lt: oid(query.cursor) } } : {}) };
  const docs = await Alert.find(filter).sort({ _id: -1 }).limit(query.limit + 1);
  const page = docs.slice(0, query.limit);
  const summaryRows = await Alert.aggregate<{ _id: { type: string; status: string }; count: number }>([
    { $match: { ...base, status: { $in: activeStatuses } } },
    { $group: { _id: { type: "$type", status: "$status" }, count: { $sum: 1 } } },
  ]);
  const summary: AlertSummary = { active: 0, outOfStock: 0, lowStock: 0, acknowledged: 0, unread: 0 };
  for (const row of summaryRows) {
    summary.active += row.count;
    if (row._id.type === "OUT_OF_STOCK") summary.outOfStock += row.count;
    else summary.lowStock += row.count;
    if (row._id.status === "ACKNOWLEDGED") summary.acknowledged += row.count;
    else summary.unread += row.count;
  }
  return { alerts: await views(organizationId, page), summary, pagination: { hasMore: docs.length > query.limit, nextCursor: docs.length > query.limit ? page.at(-1)?._id.toString() ?? null : null, limit: query.limit } };
}

export async function getAlert(identity: CurrentIdentity, alertId: string): Promise<AlertView> {
  const { organizationId } = visibleScope(identity);
  await connectToDatabase();
  const alert = await Alert.findOne({ _id: oid(alertId), organizationId });
  if (!alert) throw new AppError("ALERT_NOT_FOUND", "Alert not found.", 404);
  requireSiteAccess(identity, alert.siteId.toString());
  return (await views(organizationId, [alert]))[0];
}

export async function getAlertFilters(identity: CurrentIdentity) {
  const { organizationId, allowed } = visibleScope(identity);
  await connectToDatabase();
  const [sites, materials] = await Promise.all([
    Site.find({ organizationId, deletedAt: null, ...(allowed ? { _id: { $in: allowed } } : {}) }).select("code name").sort({ name: 1 }),
    Material.find({ organizationId, deletedAt: null }).select("code name").sort({ name: 1 }),
  ]);
  return { sites: sites.map((site) => ({ id: site._id.toString(), code: site.code, name: site.name })), materials: materials.map((material) => ({ id: material._id.toString(), code: material.code, name: material.name })) };
}

export async function acknowledgeAlert(identity: CurrentIdentity, alertId: string, note?: string | null): Promise<AlertView> {
  const { organizationId } = visibleScope(identity);
  await connectToDatabase();
  await Promise.all([ensureStockAlertsReady(), ensureAuditReady()]);
  const id = oid(alertId);
  const actorUserId = oid(identity.context.userId);
  const preflight = await Alert.findOne({ _id: id, organizationId }).select("siteId");
  if (!preflight) throw new AppError("ALERT_NOT_FOUND", "Alert not found.", 404);
  requireSiteAccess(identity, preflight.siteId.toString());
  try {
    await mongoose.connection.transaction(async (session) => {
      const alert = await Alert.findOne({ _id: id, organizationId }).session(session);
      if (!alert) throw new AppError("ALERT_NOT_FOUND", "Alert not found.", 404);
      requireSiteAccess(identity, alert.siteId.toString());
      if (alert.status === "ACKNOWLEDGED") return;
      if (alert.status !== "OPEN") throw new AppError("ALERT_ALREADY_RESOLVED", "This alert has already resolved.", 409);
      const now = new Date();
      alert.status = "ACKNOWLEDGED"; alert.acknowledgedAt = now; alert.acknowledgedBy = actorUserId; alert.acknowledgmentNote = note ?? null;
      alert.history.push({ event: "ACKNOWLEDGED", at: now, actorUserId, note: note ?? null, availableQuantity: alert.availableQuantity, minimumQuantity: alert.minimumQuantity });
      await alert.save({ session });
      await recordAudit({ organizationId, actorUserId, action: "alert.acknowledged", entityType: "alert", entityId: id.toString() }, session);
    });
  } catch (error) {
    if (error instanceof Error && error.name === "VersionError") throw new AppError("ALERT_CHANGED", "Alert changed. Reload and try again.", 409);
    throw error;
  }
  return getAlert(identity, alertId);
}

export async function getAlertRelatedWork(identity: CurrentIdentity, alert: AlertView) {
  const { organizationId } = visibleScope(identity);
  requireSiteAccess(identity, alert.site.id);
  await connectToDatabase();
  const scope = { organizationId, siteId: oid(alert.site.id), materialId: oid(alert.material.id) };
  const [orders, movements] = await Promise.all([
    PurchaseOrder.find({ organizationId, siteId: scope.siteId, status: { $in: ["ORDERED", "PARTIALLY_RECEIVED"] }, "items.materialId": scope.materialId }).select("poNumber status expectedDeliveryDate items").sort({ _id: -1 }).limit(3),
    InventoryTransaction.find(scope).select("type quantity createdAt referenceType referenceId").sort({ _id: -1 }).limit(4),
  ]);
  return {
    orders: orders.map((order) => ({ id: order._id.toString(), poNumber: order.poNumber, status: order.status, expectedDeliveryDate: order.expectedDeliveryDate?.toISOString().slice(0, 10) ?? null,
      outstanding: order.items.filter((item) => item.materialId.toString() === alert.material.id).reduce((sum, item) => sum.plus(item.quantityOrdered.toString()).minus(item.quantityReceived.toString()), new D(0)).toString() })).filter((order) => new D(order.outstanding).gt(0)),
    movements: movements.map((movement) => ({ id: movement._id.toString(), type: movement.type, quantity: movement.quantity.toString(), createdAt: movement.createdAt.toISOString(), referenceType: movement.referenceType, referenceId: movement.referenceId.toString() })),
  };
}
