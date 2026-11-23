import { z } from "zod";

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/);
const role = z.enum(["OWNER", "ADMIN", "SITE_MANAGER", "STOREKEEPER"]);
const siteIds = z.array(objectId).max(100).refine((ids) => new Set(ids.map((id) => id.toLowerCase())).size === ids.length, "Site assignments must be unique.");

export const inviteMemberSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.email().max(254).transform((value) => value.trim().toLowerCase()),
  role,
  siteIds,
}).strict();

export const acceptInvitationSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  password: z.string().min(12).max(128),
}).strict();

export const updateMembershipSchema = z.object({ role: role.optional(), status: z.enum(["ACTIVE", "INACTIVE"]).optional() }).strict().refine((value) => value.role !== undefined || value.status !== undefined);
export const replaceSitesSchema = z.object({ siteIds }).strict();
export const teamListSchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(25), cursor: objectId.optional() }).strict();

export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
export type UpdateMembershipInput = z.infer<typeof updateMembershipSchema>;
