import Link from "next/link";
import { DashboardView } from "@/modules/dashboard/components/dashboard-view";
import { dashboardQuerySchema } from "@/modules/dashboard/schemas/dashboard";
import { getDashboard } from "@/modules/dashboard/services/dashboard-service";
import { requireIdentity } from "@/server/auth/authorize";
import { AppError } from "@/shared/errors/app-error";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const identity = await requireIdentity();
  const params = await searchParams;
  const parsed = dashboardQuerySchema.safeParse({ siteId: params.siteId, from: params.from, to: params.to });
  if (!parsed.success) return <div className="cs-panel p-8"><h1 className="text-xl font-bold">Invalid dashboard filters</h1><p className="cs-muted mt-2 text-sm">Choose an active site and a valid date range.</p><Link className="cs-secondary mt-5" href="/dashboard">Clear filters</Link></div>;
  let data;
  try {
    data = await getDashboard(identity, parsed.data);
  } catch (error) {
    if (!(error instanceof AppError) || !["SITE_NOT_FOUND", "VALIDATION_ERROR"].includes(error.code)) throw error;
    return <div className="cs-panel p-8"><h1 className="text-xl font-bold">Invalid dashboard filters</h1><p className="cs-muted mt-2 text-sm">Choose an accessible site and a date range of up to one year.</p><Link className="cs-secondary mt-5" href="/dashboard">Clear filters</Link></div>;
  }
  return <DashboardView data={data} organizationName={identity.organization.name} permissions={identity.membership.permissions} />;
}
