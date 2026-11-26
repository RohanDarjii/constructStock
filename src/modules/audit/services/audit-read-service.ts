import "server-only";
import mongoose from "mongoose";
import type { CurrentIdentity } from "@/modules/auth/services/auth-service";
import { User } from "@/modules/auth/models/identity";
import { requirePermission } from "@/server/auth/authorize";
import { connectToDatabase } from "@/server/db/connect";
import { AppError } from "@/shared/errors/app-error";
import { AuditLog } from "../models/audit-log";
import type { AuditQuery } from "../schemas/audit";

const oid = (value: string) => new mongoose.Types.ObjectId(value);
const date = (value: string) => new Date(`${value}T00:00:00.000Z`);

export async function listAuditLogs(identity: CurrentIdentity, query: AuditQuery) {
  requirePermission(identity, "audit.view");
  await connectToDatabase();
  if (query.from && query.to && query.from > query.to) throw new AppError("VALIDATION_ERROR", "The start date must be before the end date.", 422);
  const organizationId = oid(identity.context.organizationId);
  const filter = {
    organizationId,
    ...(query.actorUserId ? { actorUserId: oid(query.actorUserId) } : {}),
    ...(query.entityType ? { entityType: query.entityType } : {}),
    ...(query.entityId ? { entityId: query.entityId } : {}),
    ...(query.action ? { action: query.action } : {}),
    ...(query.from || query.to ? { createdAt: { ...(query.from ? { $gte: date(query.from) } : {}), ...(query.to ? { $lt: new Date(date(query.to).getTime() + 86_400_000) } : {}) } } : {}),
    ...(query.cursor ? { _id: { $lt: oid(query.cursor) } } : {}),
  };
  const docs = await AuditLog.find(filter).sort({ _id: -1 }).limit(query.limit + 1).lean();
  const page = docs.slice(0, query.limit);
  const userIds = [...new Set(page.map((entry) => String(entry.actorUserId)))].map(oid);
  const users = await User.find({ _id: { $in: userIds } }).select("name").lean();
  const names = new Map(users.map((user) => [String(user._id), user.name]));
  return { auditLogs: page.map((entry) => ({ id: String(entry._id), action: entry.action, entityType: entry.entityType, entityId: entry.entityId, actor: { id: String(entry.actorUserId), name: names.get(String(entry.actorUserId)) ?? "Former member" }, createdAt: entry.createdAt.toISOString(), metadata: entry.metadata ?? null, ipAddress: entry.ipAddress ?? null })), pagination: { hasMore: docs.length > query.limit, nextCursor: docs.length > query.limit ? String(page.at(-1)?._id) : null, limit: query.limit } };
}

export async function getAuditLog(identity: CurrentIdentity, auditLogId: string) {
  requirePermission(identity, "audit.view");
  if (!mongoose.isValidObjectId(auditLogId)) throw new AppError("AUDIT_NOT_FOUND", "Audit event not found.", 404);
  await connectToDatabase();
  const entry = await AuditLog.findOne({ _id: oid(auditLogId), organizationId: oid(identity.context.organizationId) }).lean();
  if (!entry) throw new AppError("AUDIT_NOT_FOUND", "Audit event not found.", 404);
  const user = await User.findById(entry.actorUserId).select("name").lean();
  return { id: String(entry._id), action: entry.action, entityType: entry.entityType, entityId: entry.entityId, actor: { id: String(entry.actorUserId), name: user?.name ?? "Former member" }, createdAt: entry.createdAt.toISOString(), metadata: entry.metadata ?? null, ipAddress: entry.ipAddress ?? null };
}
