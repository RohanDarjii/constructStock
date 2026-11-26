import { z } from "zod";

const objectId = z.string().regex(/^[a-fA-F0-9]{24}$/);
const optionalSite = z.union([objectId, z.literal("")]).transform((value) => value || undefined).optional();
const optionalDate = z.union([z.iso.date(), z.literal("")]).transform((value) => value || undefined).optional();

export const dashboardQuerySchema = z.object({
  siteId: optionalSite,
  from: optionalDate,
  to: optionalDate,
}).strict();

export type DashboardQuery = z.output<typeof dashboardQuerySchema>;
