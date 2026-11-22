import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SiteForm } from "@/modules/sites/components/site-form";
import { getSite } from "@/modules/sites/services/site-service";
import { requireIdentity } from "@/server/auth/authorize";
import { AppError } from "@/shared/errors/app-error";

export default async function EditSitePage({ params }: { params: Promise<{ siteId: string }> }) {
  const identity = await requireIdentity();
  if (!identity.membership.permissions.includes("site.manage")) redirect("/sites");
  const { siteId } = await params;
  let site;
  try { site = await getSite(identity, siteId); } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  }
  if (site.status === "ARCHIVED") redirect(`/sites/${site.id}`);
  return <div className="mx-auto max-w-4xl"><Link className="text-sm text-emerald-800 underline" href={`/sites/${site.id}`}>← Back to site</Link><h1 className="mt-4 text-3xl font-semibold">Edit {site.name}</h1><p className="mt-2 mb-7 text-slate-600">Update site details. Changes will be recorded in the audit trail.</p><SiteForm site={site} currencyCode={identity.organization.currencyCode} /></div>;
}
