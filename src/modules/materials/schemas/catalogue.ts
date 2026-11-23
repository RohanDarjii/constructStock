import Decimal from "decimal.js";
import { z } from "zod";
import { materialUnits, type MaterialUnit } from "../types";

const id = z.string().regex(/^[a-fA-F0-9]{24}$/);
const optionalDescription = z.string().trim().max(1000).transform((value) => value || null);
const quantity = z.string().trim().regex(/^\d{1,16}(?:\.\d{1,3})?$/, "Use a non-negative decimal with at most three places.")
  .transform((value) => new Decimal(value).toString());

export function quantityFitsUnit(value: string, unit: MaterialUnit, positive: boolean): boolean {
  const amount = new Decimal(value);
  return (positive ? amount.gt(0) : amount.gte(0)) &&
    (unit === "BAG" || unit === "PIECE" ? amount.isInteger() : amount.decimalPlaces() <= 3);
}

const categoryFields = z.object({
  name: z.string().trim().min(2).max(120),
  description: optionalDescription.nullable().optional(),
});
export const createCategorySchema = categoryFields.strict();
export const updateCategorySchema = categoryFields.partial().strict().refine((input) => Object.keys(input).length > 0, "Provide a field to update.");
export const categoryIdSchema = id;

const materialFields = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_-]{1,29}$/, "Use 2–30 letters, numbers, underscores, or hyphens."),
  name: z.string().trim().min(2).max(120),
  description: optionalDescription.nullable().optional(),
  categoryId: id,
  unit: z.enum(materialUnits),
  minimumStockLevel: quantity,
  defaultReorderQuantity: quantity.nullable().optional(),
});

export const createMaterialSchema = materialFields.strict().superRefine((input, context) => {
  if (!quantityFitsUnit(input.minimumStockLevel, input.unit, false)) {
    context.addIssue({ code: "custom", path: ["minimumStockLevel"], message: "Quantity must match the selected unit." });
  }
  if (input.defaultReorderQuantity !== null && input.defaultReorderQuantity !== undefined && !quantityFitsUnit(input.defaultReorderQuantity, input.unit, true)) {
    context.addIssue({ code: "custom", path: ["defaultReorderQuantity"], message: "Reorder quantity must be positive and match the selected unit." });
  }
});
export const updateMaterialSchema = materialFields.partial().strict().refine((input) => Object.keys(input).length > 0, "Provide a field to update.");
export const materialIdSchema = id;

export const listCategoriesQuerySchema = z.object({ includeArchived: z.enum(["true", "false"]).default("false") }).strict();
export const listMaterialsQuerySchema = z.object({
  status: z.enum(["ACTIVE", "ARCHIVED"]).default("ACTIVE"),
  categoryId: z.union([id, z.literal("")]).transform((value) => value || undefined).optional(),
  q: z.string().trim().max(80).optional(),
  cursor: id.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
}).strict();

export type CreateCategoryInput = z.output<typeof createCategorySchema>;
export type UpdateCategoryInput = z.output<typeof updateCategorySchema>;
export type CreateMaterialInput = z.output<typeof createMaterialSchema>;
export type UpdateMaterialInput = z.output<typeof updateMaterialSchema>;
export type ListCategoriesQuery = z.output<typeof listCategoriesQuerySchema>;
export type ListMaterialsQuery = z.output<typeof listMaterialsQuerySchema>;
