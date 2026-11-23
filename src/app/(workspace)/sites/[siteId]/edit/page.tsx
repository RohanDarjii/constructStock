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
  return <div className="mx-auto max-w-6xl space-y-6"><div className="text-xs text-[#58605c]"><Link className="hover:text-[#144227]" href="/sites">Sites</Link> / <Link className="hover:text-[#144227]" href={`/sites/${site.id}`}>{site.code}</Link> / Edit</div><header><p className="cs-eyebrow">Site registry specification</p><h1 className="mt-2 text-3xl font-extrabold">Edit {site.name}</h1><p className="cs-muted mt-1 text-sm">Update the project scope, schedule, location, and primary contact.</p></header><SiteForm site={site} currencyCode={identity.organization.currencyCode} /></div>;
}
