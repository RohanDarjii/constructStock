import type { PurchaseOrderStatus } from "./schemas/purchase-order";

export type PurchaseOrderLineView = {
  id: string; material: { id: string; code: string; name: string; unit: string };
  quantityOrdered: string; quantityReceived: string; remainingQuantity: string;
  unitPrice: string; taxRate: string; subtotal: string; taxTotal: string; grandTotal: string;
};

export type PurchaseOrderView = {
  id: string; poNumber: string; status: PurchaseOrderStatus; version: number;
  site: { id: string; code: string; name: string };
  supplier: { id: string; code: string; name: string; paymentTerms: string | null };
  currencyCode: string; items: PurchaseOrderLineView[];
  subtotal: string; taxTotal: string; grandTotal: string;
  expectedDeliveryDate: string | null; notes: string | null;
  createdBy: string; createdAt: string; updatedAt: string;
  approval: {
    submittedAt: string | null; submittedBy: string | null;
    approvedAt: string | null; approvedBy: string | null; approvalRemarks: string | null;
    rejectedAt: string | null; rejectedBy: string | null; rejectionRemarks: string | null;
  };
  orderedAt: string | null; cancelledAt: string | null; cancellationRemarks: string | null;
};
