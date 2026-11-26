import "server-only";
import type mongoose from "mongoose";
import { AuditLog } from "../models/audit-log";

export async function ensureAuditReady(): Promise<void> {
  await AuditLog.init();
}

export async function recordAudit(input: {
  organizationId: mongoose.Types.ObjectId;
  actorUserId: mongoose.Types.ObjectId;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, string | number | boolean | null>;
  ipAddress?: string | null;
}, session: mongoose.ClientSession): Promise<void> {
  await AuditLog.create([input], { session });
}
