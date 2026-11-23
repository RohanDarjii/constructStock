import Decimal from "decimal.js";
import { z } from "zod";
import { siteStatuses } from "../types";

const activeStatuses = siteStatuses.filter((status) => status !== "ARCHIVED") as ["PLANNED", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"];
const optionalText = (max: number) => z.string().trim().max(max).transform((value) => value || null);
const dateOnly = z.iso.date().refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)), "Use a valid date.");
const budget = z.string().trim().regex(/^\d{1,16}(?:\.\d{1,2})?$/, "Use a non-negative amount with at most two decimal places.")
  .transform((value) => new Decimal(value).toFixed(2));

export const siteLocationSchema = z.object({
  address: optionalText(200).optional(),
  city: z.string().trim().min(1).max(100),
  state: optionalText(100).optional(),
  country: z.string().trim().min(1).max(100),
}).strict();

export const siteContactSchema = z.object({
  name: optionalText(120).optional(),
  phone: optionalText(30).optional(),
  email: z.union([z.email().max(254), z.literal("")]).transform((value) => value || null).optional(),
}).strict();

const editableSiteFields = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_-]{1,29}$/, "Use 2–30 letters, numbers, underscores, or hyphens."),
  name: z.string().trim().min(2).max(120),
  description: optionalText(1000).nullable(),
  location: siteLocationSchema,
  contact: siteContactSchema.nullable(),
  status: z.enum(activeStatuses),
  startDate: dateOnly.nullable(),
  expectedCompletionDate: dateOnly.nullable(),
  budget: budget.nullable(),
});

export const createSiteSchema = editableSiteFields.extend({
  description: editableSiteFields.shape.description.optional(),
  contact: editableSiteFields.shape.contact.optional(),
  status: editableSiteFields.shape.status.default("PLANNED"),
  startDate: editableSiteFields.shape.startDate.optional(),
  expectedCompletionDate: editableSiteFields.shape.expectedCompletionDate.optional(),
  budget: editableSiteFields.shape.budget.optional(),
}).strict();

export const updateSiteSchema = editableSiteFields.partial().strict().refine((value) => Object.keys(value).length > 0, "Provide at least one field to update.");

export const listSitesQuerySchema = z.object({
  status: z.enum(siteStatuses).optional(),
  q: z.string().trim().max(80).optional(),
  cursor: z.string().regex(/^[a-fA-F0-9]{24}$/).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
}).strict();

export const siteIdSchema = z.string().regex(/^[a-fA-F0-9]{24}$/);

export type CreateSiteInput = z.output<typeof createSiteSchema>;
export type UpdateSiteInput = z.output<typeof updateSiteSchema>;
export type ListSitesQuery = z.output<typeof listSitesQuerySchema>;
