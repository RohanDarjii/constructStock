import type { SiteStatus } from "../types";

const labels: Record<SiteStatus, string> = { PLANNED: "Planned", ACTIVE: "Active", ON_HOLD: "On hold", COMPLETED: "Completed", CANCELLED: "Cancelled", ARCHIVED: "Archived" };

export function SiteStatusBadge({ status }: { status: SiteStatus }) {
  const tone = status === "ACTIVE" ? "" : status === "ON_HOLD" || status === "CANCELLED" ? "cs-badge-warn" : status === "PLANNED" ? "cs-badge-amber" : "cs-badge-quiet";
  return <span className={`cs-badge ${tone}`}>{labels[status]}</span>;
}

export function siteDate(value: string | null): string {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

export function siteBudget(value: string | null, currencyCode: string): string {
  if (!value) return "Not set";
  const [whole, fraction = "00"] = value.split(".");
  return `${currencyCode} ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction.padEnd(2, "0")}`;
}
