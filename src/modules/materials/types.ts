export const materialUnits = ["BAG", "KG", "TON", "PIECE", "LITRE", "SQFT", "CUBIC_METER", "METER"] as const;
export type MaterialUnit = (typeof materialUnits)[number];
export type CatalogueStatus = "ACTIVE" | "ARCHIVED";

export interface CategoryView {
  id: string;
  name: string;
  description: string | null;
  status: CatalogueStatus;
  createdAt: string;
  updatedAt: string;
}

export interface MaterialView {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: { id: string; name: string };
  unit: MaterialUnit;
  minimumStockLevel: string;
  defaultReorderQuantity: string | null;
  status: CatalogueStatus;
  unitLocked: boolean;
  createdAt: string;
  updatedAt: string;
}
