import type { AlertView } from "@/modules/alerts/types";

export interface DashboardData {
  filters: { siteId: string | null; from: string; to: string; periodLabel: string };
  sites: Array<{ id: string; name: string; code: string; city: string; status: string }>;
  currencyCode: string;
  metrics: {
    activeSites: number;
    totalMaterials: number;
    inventoryValue: string;
    lowStockItems: number;
    outOfStockItems: number;
    pendingDeliveries: number;
    todayConsumptionValue: string;
    monthlyConsumptionValue: string;
    wastagePercentage: string | null;
    pendingTransfers: number;
  };
  charts: {
    trendGrouping: "day" | "month";
    consumptionTrend: Array<{ period: string; value: string }>;
    monthlyConsumption: Array<{ period: string; value: string }>;
    monthlyPurchasing: Array<{ period: string; value: string }>;
    wastageByCategory: Array<{ category: string; value: string }>;
    inventoryValueBySite: Array<{ siteId: string; site: string; value: string; materialCount: number }>;
  };
  inventory: Array<{ id: string; siteId: string; site: string; material: string; code: string; unit: string; onHand: string; reserved: string; available: string; value: string }>;
  approvals: Array<{ id: string; kind: "PURCHASE_ORDER" | "TRANSFER"; number: string; site: string; description: string; value: string | null; href: string }>;
  pendingDeliveries: Array<{ id: string; number: string; site: string; supplier: string; status: string; expectedDate: string | null; href: string }>;
  recentTransactions: Array<{ id: string; type: string; material: string; site: string; quantity: string; unit: string; createdAt: string; href: string }>;
  alerts: AlertView[];
  alertSummary: { active: number; lowStock: number; outOfStock: number; unread: number };
}
