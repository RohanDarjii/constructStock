import Link from "next/link";
import { notFound } from "next/navigation";
import { listSitesQuerySchema } from "@/modules/sites/schemas/site";
import { listSites } from "@/modules/sites/services/site-service";
import { requireIdentity } from "@/server/auth/authorize";

export default async function SitesPage({ searchParams }: { searchParams: Promise<{ status?: string; cursor?: string }> }) {
  const identity = await requireIdentity();
  const query = listSitesQuerySchema.safeParse(await searchParams);
  if (!query.success) notFound();
  const { sites, pagination } = await listSites(identity, query.data);
  const canManage = identity.membership.permissions.includes("site.manage");
  const archived = query.data.status === "ARCHIVED";
  const nextParams = new URLSearchParams();
  if (query.data.status) nextParams.set("status", query.data.status);
  if (pagination.nextCursor) nextParams.set("cursor", pagination.nextCursor);

  return <div className="space-y-7">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">Workspace</p><h1 className="mt-1 text-3xl font-semibold">Sites</h1><p className="mt-2 text-slate-600">Manage your construction sites and their project details.</p></div>{canManage && <Link className="rounded-md bg-emerald-900 px-4 py-2.5 text-sm font-semibold text-white" href="/sites/new">Create site</Link>}</div>
    <div className="flex gap-3 border-b border-slate-200 pb-3 text-sm"><Link aria-current={!archived ? "page" : undefined} className={!archived ? "font-semibold text-emerald-900" : "text-slate-600"} href="/sites">Current sites</Link><Link aria-current={archived ? "page" : undefined} className={archived ? "font-semibold text-emerald-900" : "text-slate-600"} href="/sites?status=ARCHIVED">Archived</Link></div>
    {sites.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center"><h2 className="text-lg font-semibold">{archived ? "No archived sites" : "No sites yet"}</h2><p className="mt-2 text-sm text-slate-600">{archived ? "Archived sites will appear here." : canManage ? "Create your first site to organize future inventory and activity." : "You have no site assignments yet."}</p></div> : <div className="grid gap-4 sm:grid-cols-2">{sites.map((site) => <Link className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-emerald-400 hover:shadow-md" href={`/sites/${site.id}`} key={site.id}><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">{site.code}</p><h2 className="mt-1 text-lg font-semibold text-slate-900">{site.name}</h2></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">{site.status.replaceAll("_", " ")}</span></div><p className="mt-3 text-sm text-slate-600">{site.location.city}, {site.location.country}</p>{site.description && <p className="mt-2 line-clamp-2 text-sm text-slate-500">{site.description}</p>}</Link>)}</div>}
    {pagination.hasMore && <Link className="inline-block rounded-md border border-slate-300 px-4 py-2 text-sm font-medium" href={`/sites?${nextParams.toString()}`}>Next page</Link>}
  </div>;
}
