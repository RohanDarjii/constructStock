export type ReceiptMutationResult = {
  id: string;
  receiptNumber: string;
  status: "CONFIRMED" | "REVERSED";
  purchaseOrderId: string;
  purchaseOrderStatus: string;
};

export type GoodsReceiptView = {
  id: string; receiptNumber: string; status: "CONFIRMED" | "REVERSED";
  purchaseOrder: { id: string; poNumber: string; status: string };
  site: { id: string; code: string; name: string };
  supplier: { id: string; code: string; name: string };
  receivedAt: string; createdAt: string; receivedBy: { id: string; name: string };
  invoiceNumber: string | null; deliveryChallanNumber: string | null; notes: string | null;
  attachments: Array<{ id: string; purpose: string; fileName: string; mimeType: string; size: number }>;
  reversedAt: string | null; reversedBy: string | null; reversalReason: string | null;
  netTotal: string;
  items: Array<{
    purchaseOrderItemId: string;
    material: { id: string; code: string; name: string; unit: string };
    quantityReceived: string; supplierBatchNumber: string | null; unitCost: string; netAmount: string;
    batchId: string; batchCode: string; transactionId: string;
  }>;
};
