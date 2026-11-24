import type { MaterialUnit } from "@/modules/materials/types";

export type ConsumptionMutationResult = { id: string; issueNumber: string; status: "CONFIRMED" | "REVERSED" };
export type ConsumptionView = {
  id: string; issueNumber: string; status: "CONFIRMED" | "REVERSED";
  site: { id: string; code: string; name: string };
  material: { id: string; code: string; name: string; unit: MaterialUnit };
  quantity: string; issuedAt: string; createdAt: string;
  activity: string; issuedTo: string; contractor: string | null;
  description: string | null; remarks: string | null;
  allocationMethod: "FIFO" | "MANUAL"; overrideReason: string | null;
  stockBefore: string; stockAfter: string; valueRemoved: string;
  createdBy: { id: string; name: string };
  reversedAt: string | null; reversedBy: string | null; reversalReason: string | null; reversalValue: string | null;
  batchAllocations: Array<{ batchId: string; batchCode: string; quantity: string; unitCost: string; valueRemoved: string; transactionId: string }>;
};
export type IssueOptions = {
  sites: Array<{ id: string; code: string; name: string }>;
  materials: Array<{ id: string; code: string; name: string; unit: MaterialUnit }>;
  stock: { onHand: string; reserved: string; available: string; version: number } | null;
  batches: Array<{ id: string; batchCode: string; receivedAt: string; remaining: string; available: string; unitCost: string }>;
};
