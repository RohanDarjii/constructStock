import { z } from "zod";

export const stockAlertTypes = ["LOW_STOCK", "OUT_OF_STOCK"] as const;
export const alertStatuses = ["OPEN", "ACKNOWLEDGED", "RESOLVED"] as const;

const objectId = z.string().regex(/^[a-fA-F0-9]{24}$/);
export const listAlertsSchema = z.object({
  siteId: objectId.optional(), materialId: objectId.optional(),
  status: z.enum(alertStatuses).optional(), type: z.enum(stockAlertTypes).optional(),
  severity: z.enum(["WARNING", "CRITICAL"]).optional(),
  q: z.string().trim().max(80).optional(), cursor: objectId.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
}).strict();
export const acknowledgeAlertSchema = z.object({ note: z.string().trim().max(500).nullable().optional() }).strict();
export type ListAlertsQuery = z.output<typeof listAlertsSchema>;
