import type { ReactNode } from "react";

export type WorkspaceIconName = "dashboard" | "sites" | "materials" | "suppliers" | "orders" | "receiving" | "inventory" | "consumption" | "wastage" | "transfers" | "reports" | "users" | "settings" | "bell" | "chevron" | "calendar" | "plus" | "search" | "shield" | "pin" | "wallet" | "clock" | "check" | "edit" | "archive" | "package" | "arrow" | "mail" | "phone" | "filter";

const drawings: Record<WorkspaceIconName, ReactNode> = {
  dashboard: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  sites: <><rect x="4" y="8" width="16" height="13" rx="1" /><path d="M9 8V3h6v5M8 12h2m4 0h2m-8 4h2m4 0h2M11 21v-4h2v4" /></>,
  materials: <><path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5" /></>,
  suppliers: <><path d="M3 6h11v10H3zM14 10h4l3 3v3h-7" /><circle cx="7" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></>,
  orders: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4.5h6M8 10h8M8 14h8M8 18h5" /></>,
  receiving: <><path d="M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4" /></>,
  inventory: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18m-12 4h6" /></>,
  consumption: <><path d="m3 7 5 5 4-4 7 7M15 15h4v-4" /></>,
  wastage: <><path d="m12 3 2 4h-4l2-4Zm-8 8 4-2 1 4-4 1-1-3Zm15 2 2 4-4 2-2-3m-9 1h9" /></>,
  transfers: <><path d="M3 8h17m-4-4 4 4-4 4M21 16H4m4-4-4 4 4 4" /></>,
  reports: <><path d="M4 21V4m0 17h17M8 17v-5m5 5V8m5 9V5" /></>,
  users: <><circle cx="9" cy="8" r="3" /><path d="M3 20v-2a6 6 0 0 1 12 0v2H3Zm13-14a3 3 0 0 1 0 6m1 3a5 5 0 0 1 4 5" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="m12 2 2 2 3-.5 1 3 3 1-1 3 1 3-3 1-1 3-3-.5-2 2-2-2-3 .5-1-3-3-1 1-3-1-3 3-1 1-3 3 .5 2-2Z" /></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4" /></>,
  chevron: <path d="m6 9 6 6 6-6" />,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4m10-4v4M3 10h18" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
  shield: <><path d="m12 2 8 4v6c0 5-3 8-8 10-5-2-8-5-8-10V6l8-4Z" /><path d="m9 12 2 2 4-4" /></>,
  pin: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
  wallet: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 9h18M16 14h3" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l4 2" /></>,
  check: <path d="m4 12 5 5L20 6" />,
  edit: <><path d="m4 17 13-13 3 3L7 20H4v-3Z" /><path d="m15 6 3 3" /></>,
  archive: <><rect x="3" y="4" width="18" height="5" rx="1" /><path d="M5 9v12h14V9m-10 5h6" /></>,
  package: <><path d="m12 2 9 5v10l-9 5-9-5V7l9-5ZM3 7l9 5 9-5m-9 5v10" /></>,
  arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></>,
  phone: <path d="M5 3h4l1 5-2 2a14 14 0 0 0 6 6l2-2 5 1v4c-9 3-19-7-16-16Z" />,
  filter: <><path d="M4 6h16M7 12h10m-7 6h4" /></>,
};

export function WorkspaceIcon({ name, className = "" }: { name: WorkspaceIconName; className?: string }) {
  return <svg aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">{drawings[name]}</svg>;
}
