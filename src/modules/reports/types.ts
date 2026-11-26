import type { ReportKind } from "./schemas/report";

export type ReportData = {
  kind: ReportKind;
  title: string;
  columns: string[];
  rows: string[][];
  totalRows: number;
  summary: Array<{ label: string; value: string }>;
  filters: { from: string; to: string; siteId: string | null; materialId: string | null; categoryId: string | null; supplierId: string | null };
  currencyCode: string;
};
