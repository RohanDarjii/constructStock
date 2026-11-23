import { z } from "zod";

const id = z.string().regex(/^[a-fA-F0-9]{24}$/);
const optionalText = (limit: number) => z.string().trim().max(limit).transform((value) => value || null).nullable().optional();
const addressSchema = z.object({
  line1: z.string().trim().min(2).max(200),
  city: z.string().trim().min(2).max(100),
  state: z.string().trim().min(2).max(100),
  postalCode: z.string().trim().min(2).max(20),
  country: z.string().trim().min(2).max(100),
}).strict();

const fields = z.object({
  name: z.string().trim().min(2).max(160),
  contactPerson: optionalText(120),
  phone: optionalText(30),
  email: z.union([z.email().max(254), z.literal("")]).transform((value) => value ? value.toLowerCase() : null).nullable().optional(),
  address: addressSchema.nullable().optional(),
  gstNumber: optionalText(40),
  paymentTerms: optionalText(500),
});

export const createSupplierSchema = fields.extend({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_-]{1,29}$/, "Use 2–30 letters, numbers, underscores, or hyphens."),
}).strict();
export const updateSupplierSchema = fields.partial().strict().refine((value) => Object.keys(value).length > 0, "Provide a field to update.");
export const supplierIdSchema = id;
export const listSuppliersQuerySchema = z.object({
  status: z.enum(["ACTIVE", "ARCHIVED"]).default("ACTIVE"),
  q: z.string().trim().max(80).optional(),
  cursor: id.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
}).strict();

export type CreateSupplierInput = z.output<typeof createSupplierSchema>;
export type UpdateSupplierInput = z.output<typeof updateSupplierSchema>;
export type ListSuppliersQuery = z.output<typeof listSuppliersQuerySchema>;
