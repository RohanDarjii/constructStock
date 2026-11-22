import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteActions } from "@/modules/sites/components/site-actions";
import { getSite } from "@/modules/sites/services/site-service";
import { requireIdentity } from "@/server/auth/authorize";
import { AppError } from "@/shared/errors/app-error";

export default async function SitePage({ params }: { params: Promise<{ siteId: string }> }) {
  const identity = await requireIdentity();
  const { siteId } = await params;
  let site;
  try { site = await getSite(identity, siteId); } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  }
  const canManage = identity.membership.permissions.includes("site.manage");
  return <div className="space-y-7">
    <div><Link className="text-sm text-emerald-800 underline" href="/sites">← Back to sites</Link><div className="mt-4 flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">{site.code}</p><h1 className="mt-1 text-3xl font-semibold">{site.name}</h1><p className="mt-2 text-slate-600">{site.location.city}, {site.location.country} · {site.status.replaceAll("_", " ")}</p></div>{canManage && <div className="flex items-center gap-3">{site.status !== "ARCHIVED" && <Link className="rounded-md bg-emerald-900 px-4 py-2 text-sm font-semibold text-white" href={`/sites/${site.id}/edit`}>Edit site</Link>}<SiteActions site={site} /></div>}</div></div>
    {site.description && <p className="rounded-xl border border-slate-200 bg-white p-5 text-slate-700">{site.description}</p>}
    <div className="grid gap-4 md:grid-cols-2"><section className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="font-semibold">Project</h2><dl className="mt-4 space-y-3 text-sm"><div><dt className="text-slate-500">Start date</dt><dd className="font-medium">{site.startDate ?? "Not set"}</dd></div><div><dt className="text-slate-500">Expected completion</dt><dd className="font-medium">{site.expectedCompletionDate ?? "Not set"}</dd></div><div><dt className="text-slate-500">Budget</dt><dd className="font-medium">{site.budget ? `${site.budget} ${site.currencyCode}` : "Not set"}</dd></div></dl></section><section className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="font-semibold">Location and contact</h2><dl className="mt-4 space-y-3 text-sm"><div><dt className="text-slate-500">Address</dt><dd className="font-medium">{[site.location.address, site.location.city, site.location.state, site.location.country].filter(Boolean).join(", ")}</dd></div><div><dt className="text-slate-500">Contact</dt><dd className="font-medium">{site.contact?.name || "Not set"}</dd></div>{site.contact?.phone && <div><dt className="text-slate-500">Phone</dt><dd className="font-medium">{site.contact.phone}</dd></div>}{site.contact?.email && <div><dt className="text-slate-500">Email</dt><dd className="font-medium">{site.contact.email}</dd></div>}</dl></section></div>
  </div>;
}
