import { z } from "zod";

const id = z.string().regex(/^[a-fA-F0-9]{24}$/);
const optionalId = z.union([id, z.literal("")]).transform((value) => value || undefined).optional();
const optionalText = z.union([z.string().trim().max(80), z.literal("")]).transform((value) => value || undefined).optional();
const optionalDate = z.union([z.iso.date(), z.literal("")]).transform((value) => value || undefined).optional();

export const auditQuerySchema = z.object({
  actorUserId: optionalId,
  entityType: optionalText,
  entityId: optionalText,
  action: optionalText,
  from: optionalDate,
  to: optionalDate,
  cursor: optionalId,
  limit: z.coerce.number().int().min(1).max(100).default(25),
}).strict();
export type AuditQuery = z.output<typeof auditQuerySchema>;
