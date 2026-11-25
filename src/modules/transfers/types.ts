import type { MaterialUnit } from "@/modules/materials/types";
import type { TransferStatus } from "./schemas/transfer";

export type TransferMutationResult = { id: string; transferNumber: string; status: TransferStatus };
export type TransferView = {
  id: string; transferNumber: string; status: TransferStatus; quantity: string; createdAt: string; targetDate: string | null;
  reason: string; purpose: string; notes: string | null;
  sourceSite: { id: string; code: string; name: string };
  destinationSite: { id: string; code: string; name: string };
  material: { id: string; code: string; name: string; unit: MaterialUnit };
  requestedBy: { id: string; name: string }; requestedAt: string;
  approvedBy: { id: string; name: string } | null; approvedAt: string | null;
  dispatchedBy: { id: string; name: string } | null; dispatchedAt: string | null;
  receivedBy: { id: string; name: string } | null; receivedAt: string | null;
  closedBy: { id: string; name: string } | null; closedAt: string | null; closureReason: string | null;
  inTransitQuantity: string; inTransitValue: string; transferValue: string;
  receiptValue: string; roundingVariance: string;
  allocations: Array<{ batchId: string; batchCode: string; destinationBatchId: string | null; quantity: string; unitCost: string; value: string }>;
};
export type TransferOptions = {
  sourceSites: Array<{ id: string; code: string; name: string }>;
  destinationSites: Array<{ id: string; code: string; name: string }>;
  materials: Array<{ id: string; code: string; name: string; unit: MaterialUnit }>;
  stock: { onHand: string; reserved: string; available: string; version: number } | null;
  batches: Array<{ id: string; batchCode: string; receivedAt: string; remaining: string; available: string; unitCost: string }>;
};
