import type { MaterialUnit } from "@/modules/materials/types";

export type AlertView = {
  id: string; alertNumber: string; type: "LOW_STOCK" | "OUT_OF_STOCK"; severity: "WARNING" | "CRITICAL";
  status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED";
  site: { id: string; code: string; name: string };
  material: { id: string; code: string; name: string; unit: MaterialUnit };
  title: string; message: string; available: string; onHand: string; reserved: string; minimum: string;
  triggerSource: string; triggeredAt: string; updatedAt: string;
  acknowledgedAt: string | null; acknowledgedBy: { id: string; name: string } | null; acknowledgmentNote: string | null;
  resolvedAt: string | null; resolutionReason: string | null;
  history: Array<{ event: string; at: string; actor: { id: string; name: string } | null; note: string | null; available: string; minimum: string }>;
};
export type AlertSummary = { active: number; outOfStock: number; lowStock: number; acknowledged: number; unread: number };
