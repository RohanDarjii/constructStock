import Decimal from "decimal.js";
import type { AlertView } from "../types";

export function AlertBadge({ alert }: { alert: Pick<AlertView, "type" | "status"> }) {
  if (alert.status === "RESOLVED") return <span className="inline-flex items-center gap-1 rounded-full bg-[#d9f4e2] px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-[#144227]">✓ Resolved</span>;
  return alert.type === "OUT_OF_STOCK"
    ? <span className="inline-flex items-center gap-1 rounded-full bg-[#ba1a1a] px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-white">ⓘ Critical · Out of stock</span>
    : <span className="inline-flex items-center gap-1 rounded-full bg-[#ffd9dd] px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-[#5c2b33]">⚠ Warning · Low stock</span>;
}

export function StockGauge({ available, minimum, unit, compact = false }: { available: string; minimum: string; unit: string; compact?: boolean }) {
  const stock = new Decimal(available), threshold = new Decimal(minimum);
  const percent = threshold.gt(0) ? Math.max(0, Math.min(100, stock.div(threshold).times(100).toNumber())) : stock.gt(0) ? 100 : 0;
  return <div className={compact ? "min-w-[115px]" : "w-full"}>
    <div className="mb-2 flex justify-between gap-2 text-[11px] font-bold"><span className={stock.isZero() ? "text-[#ba1a1a]" : "text-[#5c2b33]"}>{stock.toString()} {unit}</span><span className="text-[#58605c]">{percent.toFixed(0)}% of minimum</span></div>
    <div className="h-1.5 overflow-hidden rounded-full bg-[#eae7eb]"><div className={`h-full rounded-full ${stock.isZero() ? "bg-[#ba1a1a]" : "bg-[#5c2b33]"}`} style={{ width: `${percent}%` }} /></div>
  </div>;
}

export const alertDate = (value: string) => `${new Date(value).toLocaleString("en-GB", { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })} UTC`;
