import { redirect } from "next/navigation";
import { WorkspaceIcon } from "@/components/workspace/workspace-icon";
import { WorkspaceSidebar } from "@/components/workspace/workspace-sidebar";
import { AlertBell } from "@/modules/alerts/components/alert-bell";
import { listAlertsSchema } from "@/modules/alerts/schemas/alert";
import { listAlerts } from "@/modules/alerts/services/stock-alert-service";
import { LogoutButton } from "@/modules/auth/components/logout-button";
import { currentIdentity } from "@/server/auth/session";

export default async function WorkspaceLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const identity = await currentIdentity();
  if (!identity) redirect("/login");
  const alertData = identity.membership.permissions.includes("inventory.view") ? await listAlerts(identity, listAlertsSchema.parse({ limit: 5 })) : null;

  return <div className="workspace-shell">
    <WorkspaceSidebar role={identity.membership.role} userName={identity.user.name} unreadAlerts={alertData?.summary.unread ?? 0} canViewAlerts={Boolean(alertData)} />
    <div className="workspace-content">
      <header className="workspace-topbar"><div className="workspace-mobile-brand">ConstructStock <span>Inventory &amp; Waste</span></div><div className="workspace-topbar-context"><span className="workspace-topbar-chip"><WorkspaceIcon className="h-4 w-4" name="sites" />{identity.organization.name}</span><span className="workspace-topbar-chip hidden sm:inline-flex"><WorkspaceIcon className="h-4 w-4" name="shield" />{identity.membership.role.replaceAll("_", " ")}</span></div><div className="ml-auto flex items-center gap-3">{alertData && <AlertBell alerts={alertData.alerts} unread={alertData.summary.unread} />}<div className="workspace-mobile-logout"><LogoutButton /></div><div className="workspace-topbar-user" title={identity.user.name}>{identity.user.name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("")}</div></div></header>
      <main className="workspace-main">{children}</main>
    </div>
  </div>;
}
