import type { MaterialUnit } from "@/modules/materials/types";
import type { WastageReason } from "./schemas/wastage";

export type WastageMutationResult = { id: string; wastageNumber: string; status: "CONFIRMED" | "REVERSED" };
export type WastageView = {
  id: string; wastageNumber: string; status: "CONFIRMED" | "REVERSED";
  site: { id: string; code: string; name: string };
  material: { id: string; code: string; name: string; unit: MaterialUnit };
  quantity: string; wastedAt: string; createdAt: string; reason: WastageReason;
  activity: string | null; notes: string | null;
  allocationMethod: "FIFO" | "MANUAL"; overrideReason: string | null;
  stockBefore: string; stockAfter: string; onHandBefore: string; onHandAfter: string; valueRemoved: string;
  createdBy: { id: string; name: string };
  reversedAt: string | null; reversedBy: string | null; reversalReason: string | null; reversalValue: string | null;
  batchAllocations: Array<{ batchId: string; batchCode: string; quantity: string; unitCost: string; valueRemoved: string; transactionId: string }>;
  attachments: Array<{ id: string; fileName: string; mimeType: string; size: number }>;
};
export type WastageOptions = {
  sites: Array<{ id: string; code: string; name: string }>;
  materials: Array<{ id: string; code: string; name: string; unit: MaterialUnit }>;
  stock: { onHand: string; reserved: string; available: string; version: number } | null;
  batches: Array<{ id: string; batchCode: string; receivedAt: string; remaining: string; available: string; unitCost: string }>;
};
export type WastageSummary = {
  totalRecords: number; confirmedRecords: number; reversedRecords: number; affectedSites: number;
  valueLost: string; wastagePercentage: string | null; receivedQuantity: string | null; wastedQuantity: string | null;
};
