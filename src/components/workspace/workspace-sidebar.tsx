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
  { href: "/purchase-orders", label: "Purchase Orders", icon: "orders" },
  { href: "/goods-receipts", label: "Receiving", icon: "receiving" },
  { href: "/team", label: "Team", icon: "users" },
];
const upcoming: { label: string; icon: WorkspaceIconName }[] = [
  { label: "Consumption", icon: "consumption" },
  { label: "Wastage", icon: "wastage" }, { label: "Transfers", icon: "transfers" },
  { label: "Reports", icon: "reports" }, { label: "Settings", icon: "settings" },
];

export function WorkspaceSidebar({ userName, role }: { userName: string; role: string }) {
  const pathname = usePathname();
  const initials = userName.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
  return <aside className="workspace-sidebar">
    <Link className="workspace-brand" href="/dashboard"><span className="workspace-brand-mark"><WorkspaceIcon name="sites" className="h-5 w-5" /></span><span><strong>ConstructStock</strong><small>Inventory &amp; Waste</small></span></Link>
    <nav aria-label="Workspace navigation" className="workspace-nav">
      {available.slice(0, 3).map((item) => { const active = pathname === item.href || pathname.startsWith(`${item.href}/`); return <Link aria-current={active ? "page" : undefined} className={`workspace-nav-item ${active ? "workspace-nav-active" : ""}`} href={item.href} key={item.href}><WorkspaceIcon name={item.icon} className="h-[18px] w-[18px]" />{item.label}</Link>; })}
      {upcoming.slice(0, 6).map((item) => <span aria-disabled="true" className="workspace-nav-item workspace-nav-future" key={item.label}><WorkspaceIcon name={item.icon} className="h-[18px] w-[18px]" />{item.label}</span>)}
      {available.slice(3).filter((item) => item.href !== "/team" || role === "OWNER" || role === "ADMIN").map((item) => { const active = pathname === item.href || pathname.startsWith(`${item.href}/`); return <Link aria-current={active ? "page" : undefined} className={`workspace-nav-item ${active ? "workspace-nav-active" : ""}`} href={item.href} key={item.href}><WorkspaceIcon name={item.icon} className="h-[18px] w-[18px]" />{item.label}</Link>; })}
      {upcoming.slice(6).map((item) => <span aria-disabled="true" className="workspace-nav-item workspace-nav-future" key={item.label}><WorkspaceIcon name={item.icon} className="h-[18px] w-[18px]" />{item.label}</span>)}
    </nav>
    <div className="workspace-profile"><div className="workspace-avatar">{initials}</div><div className="min-w-0 flex-1"><strong className="block truncate text-xs">{userName}</strong><small className="block text-[11px] capitalize text-[#58605c]">{role.toLowerCase().replaceAll("_", " ")}</small></div><LogoutButton /></div>
  </aside>;
}
