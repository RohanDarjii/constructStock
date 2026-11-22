import "server-only";
import type mongoose from "mongoose";
import { SiteAssignment } from "../models/site-assignment";

export async function listActiveSiteIds(organizationId: mongoose.Types.ObjectId, userId: mongoose.Types.ObjectId): Promise<string[]> {
  const assignments = await SiteAssignment.find({ organizationId, userId, revokedAt: null }).select("siteId").lean();
  return assignments.map((assignment) => assignment.siteId.toString());
}
