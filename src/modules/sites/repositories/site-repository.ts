import "server-only";
import mongoose from "mongoose";
import { Site } from "../models/site";
import type { SiteStatus } from "../types";

export type SiteDocument = InstanceType<typeof Site>;

export async function ensureSiteReady(): Promise<void> {
  await Site.init();
}

export async function createSiteDocument(values: Record<string, unknown>, session: mongoose.ClientSession) {
  const [site] = await Site.create([values], { session });
  return site;
}

export async function findSiteDocument(organizationId: mongoose.Types.ObjectId, siteId: mongoose.Types.ObjectId, session?: mongoose.ClientSession) {
  return Site.findOne({ organizationId, _id: siteId }).session(session ?? null);
}

export async function saveSiteDocument(site: InstanceType<typeof Site>, session: mongoose.ClientSession): Promise<void> {
  await site.save({ session });
}

export async function listSiteDocuments(input: {
  organizationId: mongoose.Types.ObjectId;
  assignedSiteIds: mongoose.Types.ObjectId[] | null;
  status?: SiteStatus;
  q?: string;
  cursor?: mongoose.Types.ObjectId;
  limit: number;
}) {
  const filter: {
    organizationId: mongoose.Types.ObjectId;
    _id?: { $in?: mongoose.Types.ObjectId[]; $lt?: mongoose.Types.ObjectId };
    status?: SiteStatus;
    deletedAt?: null | { $ne: null };
    $or?: Array<Record<string, unknown>>;
  } = { organizationId: input.organizationId };
  if (input.assignedSiteIds) filter._id = { $in: input.assignedSiteIds };
  if (input.cursor) filter._id = input.assignedSiteIds
    ? { $in: input.assignedSiteIds, $lt: input.cursor }
    : { $lt: input.cursor };
  if (input.status) filter.status = input.status;
  const escaped = input.q?.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (escaped) filter.$or = [{ code: { $regex: escaped, $options: "i" } }, { name: { $regex: escaped, $options: "i" } }, { "location.city": { $regex: escaped, $options: "i" } }];
  filter.deletedAt = input.status === "ARCHIVED" ? { $ne: null } : null;
  return Site.find(filter).sort({ _id: -1 }).limit(input.limit + 1);
}
