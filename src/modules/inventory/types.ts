import type { MaterialUnit } from "@/modules/materials/types";

export type InventorySite = { id: string; code: string; name: string };
export type InventoryMaterial = { id: string; code: string; name: string; unit: MaterialUnit };

export interface BalanceView {
  id: string;
  site: InventorySite;
  material: InventoryMaterial;
  onHandQuantity: string;
  reservedQuantity: string;
  availableQuantity: string;
  inventoryValue: string;
  minimumStockLevel: string;
  lowStock: boolean;
  version: number;
  updatedAt: string;
}

export interface BatchView {
  id: string;
  site: InventorySite;
  material: InventoryMaterial;
  batchCode: string;
  receivedAt: string;
  initialQuantity: string;
  remainingQuantity: string;
  reservedQuantity: string;
  unitCost: string;
  status: "ACTIVE" | "DEPLETED" | "QUARANTINED" | "REVERSED";
  version: number;
  sourceBatchId: string | null;
  goodsReceiptId: string | null;
  sourceTransferId: string | null;
}

export interface TransactionView {
  id: string;
  site: InventorySite;
  material: InventoryMaterial;
  batchId: string | null;
  type: string;
  quantity: string;
  unitCost: string | null;
  referenceType: string;
  referenceId: string;
  reversalOfTransactionId: string | null;
  performedBy: string;
  createdAt: string;
}

export interface AdjustmentView {
  id: string;
  siteId: string;
  materialId: string;
  direction: "IN" | "OUT";
  quantity: string;
  reasonCode: string;
  remarks: string;
  batchIds: string[];
  createdAt: string;
}
