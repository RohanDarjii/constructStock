import Link from "next/link";
import { OrganizationSettingsForm } from "@/modules/organization/components/organization-settings-form";
import { getOrganization } from "@/modules/organization/services/organization-service";
import { requireIdentity } from "@/server/auth/authorize";

export default async function SettingsPage() {
  const identity = await requireIdentity();
  const organization = await getOrganization(identity);
  const canManage = identity.membership.permissions.includes("organization.manage");
  return <div className="space-y-6"><header><p className="cs-eyebrow">Workspace / Administration</p><h1 className="mt-2 text-3xl font-extrabold">Organization settings</h1><p className="cs-muted mt-1 text-sm">Review your company profile and commercial currency.</p></header><section className="cs-panel p-6"><h2 className="text-lg font-extrabold">Company profile</h2>{canManage ? <OrganizationSettingsForm name={organization.name} /> : <p className="mt-4 text-sm font-semibold">{organization.name}</p>}<dl className="mt-6 grid gap-5 border-t border-[#eae7eb] pt-5 sm:grid-cols-2"><div><dt className="cs-stat-label">Workspace identifier</dt><dd className="mt-2 font-mono text-sm">{organization.slug}</dd></div><div><dt className="cs-stat-label">Currency</dt><dd className="mt-2 text-sm font-bold">{organization.currencyCode}</dd><p className="cs-muted mt-1 text-xs">One currency is used for inventory and purchasing.</p></div><div><dt className="cs-stat-label">Status</dt><dd className="mt-2 text-sm font-bold">{organization.status}</dd></div><div><dt className="cs-stat-label">Created</dt><dd className="mt-2 text-sm">{new Date(organization.createdAt).toLocaleDateString("en-GB", { timeZone: "UTC" })}</dd></div></dl></section><section className="cs-panel p-6"><h2 className="text-lg font-extrabold">Access and accountability</h2><div className="mt-4 flex flex-wrap gap-2">{["OWNER", "ADMIN"].includes(identity.membership.role) && <Link className="cs-secondary" href="/team">Manage team access</Link>}{identity.membership.permissions.includes("audit.view") && <Link className="cs-secondary" href="/audit-logs">View audit history</Link>}</div></section></div>;
}
