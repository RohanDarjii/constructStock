import "server-only";
import mongoose from "mongoose";
import { Organization } from "@/modules/auth/models/identity";
import type { CurrentIdentity } from "@/modules/auth/services/auth-service";
import { ensureAuditReady, recordAudit } from "@/modules/audit/services/record-audit";
import { requirePermission } from "@/server/auth/authorize";
import { connectToDatabase } from "@/server/db/connect";
import { AppError } from "@/shared/errors/app-error";
import type { UpdateOrganizationInput } from "../schemas/organization";

const oid = (value: string) => new mongoose.Types.ObjectId(value);

export async function getOrganization(identity: CurrentIdentity) {
  await connectToDatabase();
  const organization = await Organization.findOne({ _id: oid(identity.context.organizationId), status: "ACTIVE", deletedAt: null }).select("name slug currencyCode status createdAt").lean();
  if (!organization) throw new AppError("ORGANIZATION_NOT_FOUND", "Organization not found.", 404);
  return { id: String(organization._id), name: organization.name, slug: organization.slug, currencyCode: organization.currencyCode, status: organization.status, createdAt: organization.createdAt.toISOString() };
}

export async function updateOrganization(identity: CurrentIdentity, input: UpdateOrganizationInput) {
  requirePermission(identity, "organization.manage");
  await connectToDatabase();
  await ensureAuditReady();
  const organizationId = oid(identity.context.organizationId);
  const actorUserId = oid(identity.context.userId);
  await mongoose.connection.transaction(async (session) => {
    const organization = await Organization.findOne({ _id: organizationId, status: "ACTIVE", deletedAt: null }).session(session);
    if (!organization) throw new AppError("ORGANIZATION_NOT_FOUND", "Organization not found.", 404);
    if (organization.name === input.name) return;
    const previousName = organization.name;
    organization.name = input.name;
    await organization.save({ session });
    await recordAudit({ organizationId, actorUserId, action: "organization.updated", entityType: "organization", entityId: organizationId.toString(), metadata: { previousName, name: input.name } }, session);
  });
  return getOrganization(identity);
}
