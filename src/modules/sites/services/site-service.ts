import "server-only";
import mongoose from "mongoose";
import { ensureAuditReady, recordAudit } from "@/modules/audit/services/record-audit";
import type { CurrentIdentity } from "@/modules/auth/services/auth-service";
import { requirePermission, requireSiteAccess, hasOrganizationWideSiteAccess } from "@/server/auth/authorize";
import { connectToDatabase } from "@/server/db/connect";
import { AppError } from "@/shared/errors/app-error";
import { isDuplicateKey } from "@/modules/auth/services/security";
import { hasSiteStock } from "@/modules/inventory/services/site-archive-guard";
import { hasOpenPurchaseOrderForSite } from "@/modules/purchasing/services/site-archive-guard";
import type { CreateSiteInput, ListSitesQuery, UpdateSiteInput } from "../schemas/site";
import type { SiteView, SiteStatus } from "../types";
import { createSiteDocument, ensureSiteReady, findSiteDocument, listSiteDocuments, saveSiteDocument, type SiteDocument } from "../repositories/site-repository";

function toObjectId(value: string): mongoose.Types.ObjectId {
  if (!/^[a-fA-F0-9]{24}$/.test(value)) throw new AppError("SITE_NOT_FOUND", "Site not found.", 404);
  return new mongoose.Types.ObjectId(value);
}

function toDate(value: string | null | undefined): Date | null {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

function dateString(value: Date | null | undefined): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function checkDates(start: Date | null, end: Date | null): void {
  if (start && end && start > end) {
    throw new AppError("INVALID_SITE_DATES", "Expected completion must be on or after the start date.", 422);
  }
}

function siteView(site: SiteDocument, currencyCode: string): SiteView {
  return {
    id: site._id.toString(),
    code: site.code,
    name: site.name,
    description: site.description ?? null,
    location: { address: site.location.address ?? null, city: site.location.city, state: site.location.state ?? null, country: site.location.country },
    contact: site.contact ? { name: site.contact.name ?? null, phone: site.contact.phone ?? null, email: site.contact.email ?? null } : null,
    status: site.status as SiteStatus,
    startDate: dateString(site.startDate),
    expectedCompletionDate: dateString(site.expectedCompletionDate),
    budget: site.budget?.toString() ?? null,
    currencyCode,
    createdAt: site.createdAt.toISOString(),
    updatedAt: site.updatedAt.toISOString(),
  };
}

function mutationError(error: unknown): never {
  if (isDuplicateKey(error)) throw new AppError("SITE_CODE_EXISTS", "A site with this code already exists in your company.", 409);
  if (error instanceof Error && error.name === "VersionError") throw new AppError("SITE_CHANGED", "This site changed. Reload and try again.", 409);
  throw error;
}

export async function listSites(identity: CurrentIdentity, query: ListSitesQuery) {
  await connectToDatabase();
  const assignedSiteIds = hasOrganizationWideSiteAccess(identity) ? null : identity.context.assignedSiteIds.map(toObjectId);
  if (assignedSiteIds?.length === 0) return { sites: [] as SiteView[], pagination: { nextCursor: null, hasMore: false, limit: query.limit } };
  const documents = await listSiteDocuments({
    organizationId: toObjectId(identity.context.organizationId),
    assignedSiteIds,
    status: query.status,
    q: query.q,
    cursor: query.cursor ? toObjectId(query.cursor) : undefined,
    limit: query.limit,
  });
  const hasMore = documents.length > query.limit;
  const page = documents.slice(0, query.limit);
  return {
    sites: page.map((site) => siteView(site, identity.organization.currencyCode)),
    pagination: { nextCursor: hasMore ? page.at(-1)?._id.toString() ?? null : null, hasMore, limit: query.limit },
  };
}

export async function getSite(identity: CurrentIdentity, siteId: string): Promise<SiteView> {
  requireSiteAccess(identity, siteId);
  await connectToDatabase();
  const site = await findSiteDocument(toObjectId(identity.context.organizationId), toObjectId(siteId));
  if (!site) throw new AppError("SITE_NOT_FOUND", "Site not found.", 404);
  return siteView(site, identity.organization.currencyCode);
}

export async function createSite(identity: CurrentIdentity, input: CreateSiteInput): Promise<SiteView> {
  requirePermission(identity, "site.manage");
  await connectToDatabase();
  await Promise.all([ensureSiteReady(), ensureAuditReady()]);
  const organizationId = toObjectId(identity.context.organizationId);
  const actorUserId = toObjectId(identity.context.userId);
  const startDate = toDate(input.startDate);
  const expectedCompletionDate = toDate(input.expectedCompletionDate);
  checkDates(startDate, expectedCompletionDate);
  try {
    const site = await mongoose.connection.transaction(async (session) => {
      const created = await createSiteDocument({
        organizationId, code: input.code, name: input.name, description: input.description ?? null,
        location: input.location, contact: input.contact ?? null, status: input.status,
        startDate, expectedCompletionDate,
        budget: input.budget === null || input.budget === undefined ? null : mongoose.Types.Decimal128.fromString(input.budget),
        createdBy: actorUserId,
      }, session);
      await recordAudit({ organizationId, actorUserId, action: "site.created", entityType: "site", entityId: created._id.toString() }, session);
      return created;
    });
    return siteView(site, identity.organization.currencyCode);
  } catch (error) { return mutationError(error); }
}

export async function updateSite(identity: CurrentIdentity, siteId: string, input: UpdateSiteInput): Promise<SiteView> {
  requirePermission(identity, "site.manage");
  await connectToDatabase();
  await ensureAuditReady();
  const organizationId = toObjectId(identity.context.organizationId);
  const actorUserId = toObjectId(identity.context.userId);
  try {
    const site = await mongoose.connection.transaction(async (session) => {
      const existing = await findSiteDocument(organizationId, toObjectId(siteId), session);
      if (!existing) throw new AppError("SITE_NOT_FOUND", "Site not found.", 404);
      if (existing.deletedAt) throw new AppError("SITE_ARCHIVED", "Restore this site before editing it.", 409);
      const startDate = input.startDate === undefined ? existing.startDate : toDate(input.startDate);
      const expectedCompletionDate = input.expectedCompletionDate === undefined ? existing.expectedCompletionDate : toDate(input.expectedCompletionDate);
      checkDates(startDate ?? null, expectedCompletionDate ?? null);
      if (input.code !== undefined) existing.code = input.code;
      if (input.name !== undefined) existing.name = input.name;
      if (input.description !== undefined) existing.description = input.description;
      if (input.location !== undefined) existing.location = input.location;
      if (input.contact !== undefined) existing.contact = input.contact;
      if (input.status !== undefined) existing.status = input.status;
      existing.startDate = startDate;
      existing.expectedCompletionDate = expectedCompletionDate;
      if (input.budget !== undefined) existing.budget = input.budget === null ? null : mongoose.Types.Decimal128.fromString(input.budget);
      await saveSiteDocument(existing, session);
      await recordAudit({ organizationId, actorUserId, action: "site.updated", entityType: "site", entityId: siteId }, session);
      return existing;
    });
    return siteView(site, identity.organization.currencyCode);
  } catch (error) { return mutationError(error); }
}

async function changeArchive(identity: CurrentIdentity, siteId: string, restore: boolean): Promise<SiteView> {
  requirePermission(identity, "site.manage");
  await connectToDatabase();
  await ensureAuditReady();
  const organizationId = toObjectId(identity.context.organizationId);
  const actorUserId = toObjectId(identity.context.userId);
  try {
    const site = await mongoose.connection.transaction(async (session) => {
      const existing = await findSiteDocument(organizationId, toObjectId(siteId), session);
      if (!existing) throw new AppError("SITE_NOT_FOUND", "Site not found.", 404);
      if (restore) {
        if (!existing.deletedAt) throw new AppError("SITE_NOT_ARCHIVED", "This site is not archived.", 409);
        existing.status = existing.statusBeforeArchive ?? "PLANNED";
        existing.statusBeforeArchive = null;
        existing.deletedAt = null;
        existing.deletedBy = null;
      } else {
        if (existing.deletedAt) throw new AppError("SITE_ARCHIVED", "This site is already archived.", 409);
        if (await hasSiteStock(organizationId, existing._id, session)) {
          throw new AppError("SITE_HAS_ACTIVE_STOCK", "Finish open transfers and remove stock before archiving this site.", 409);
        }
        if (await hasOpenPurchaseOrderForSite(organizationId, existing._id, session)) {
          throw new AppError("SITE_HAS_OPEN_ORDERS", "This site has an open purchase order.", 409);
        }
        existing.statusBeforeArchive = existing.status;
        existing.status = "ARCHIVED";
        existing.deletedAt = new Date();
        existing.deletedBy = actorUserId;
      }
      await saveSiteDocument(existing, session);
      await recordAudit({ organizationId, actorUserId, action: restore ? "site.restored" : "site.archived", entityType: "site", entityId: siteId }, session);
      return existing;
    });
    return siteView(site, identity.organization.currencyCode);
  } catch (error) { return mutationError(error); }
}

export const archiveSite = (identity: CurrentIdentity, siteId: string) => changeArchive(identity, siteId, false);
export const restoreSite = (identity: CurrentIdentity, siteId: string) => changeArchive(identity, siteId, true);
