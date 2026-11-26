"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoutButton } from "@/modules/auth/components/logout-button";
import { WorkspaceIcon, type WorkspaceIconName } from "./workspace-icon";

const available: { href: string; label: string; icon: WorkspaceIconName }[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/sites", label: "Sites", icon: "sites" },
  { href: "/materials", label: "Materials", icon: "materials" },
  { href: "/suppliers", label: "Suppliers", icon: "suppliers" },
  { href: "/inventory", label: "Inventory", icon: "inventory" },
  { href: "/alerts", label: "Alerts", icon: "bell" },
  { href: "/purchase-orders", label: "Purchase Orders", icon: "orders" },
  { href: "/goods-receipts", label: "Receiving", icon: "receiving" },
  { href: "/consumptions", label: "Consumption", icon: "consumption" },
  { href: "/wastages", label: "Wastage", icon: "wastage" },
  { href: "/transfers", label: "Transfers", icon: "transfers" },
  { href: "/team", label: "Team", icon: "users" },
  { href: "/reports", label: "Reports", icon: "reports" },
  { href: "/audit-logs", label: "Audit history", icon: "shield" },
  { href: "/settings", label: "Settings", icon: "settings" },
];

export function WorkspaceSidebar({ userName, role, unreadAlerts, canViewAlerts }: { userName: string; role: string; unreadAlerts: number; canViewAlerts: boolean }) {
  const pathname = usePathname();
  const initials = userName.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
  return <aside className="workspace-sidebar">
    <Link className="workspace-brand" href="/dashboard"><span className="workspace-brand-mark"><WorkspaceIcon name="sites" className="h-5 w-5" /></span><span><strong>ConstructStock</strong><small>Inventory &amp; Waste</small></span></Link>
    <nav aria-label="Workspace navigation" className="workspace-nav">
      {available.slice(0, 3).map((item) => { const active = pathname === item.href || pathname.startsWith(`${item.href}/`); return <Link aria-current={active ? "page" : undefined} className={`workspace-nav-item ${active ? "workspace-nav-active" : ""}`} href={item.href} key={item.href}><WorkspaceIcon name={item.icon} className="h-[18px] w-[18px]" />{item.label}</Link>; })}
      {available.slice(3).filter((item) => (item.href !== "/team" && item.href !== "/audit-logs" || role === "OWNER" || role === "ADMIN") && (item.href !== "/settings" || role === "OWNER") && (item.href !== "/reports" || role !== "STOREKEEPER") && (item.href !== "/alerts" || canViewAlerts)).map((item) => { const active = pathname === item.href || pathname.startsWith(`${item.href}/`); return <Link aria-current={active ? "page" : undefined} className={`workspace-nav-item ${active ? "workspace-nav-active" : ""}`} href={item.href} key={item.href}><WorkspaceIcon name={item.icon} className="h-[18px] w-[18px]" />{item.label}{item.href === "/alerts" && unreadAlerts > 0 && <span className="ml-auto rounded-full bg-[#ba1a1a] px-1.5 text-[10px] font-extrabold text-white">{unreadAlerts > 99 ? "99+" : unreadAlerts}</span>}</Link>; })}
    </nav>
    <div className="workspace-profile"><div className="workspace-avatar">{initials}</div><div className="min-w-0 flex-1"><strong className="block truncate text-xs">{userName}</strong><small className="block text-[11px] capitalize text-[#58605c]">{role.toLowerCase().replaceAll("_", " ")}</small></div><LogoutButton /></div>
  </aside>;
}
