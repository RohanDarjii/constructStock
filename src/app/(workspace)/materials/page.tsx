import Link from "next/link";
import { notFound } from "next/navigation";
import { listCategories } from "@/modules/materials/services/category-service";
import { listMaterialsQuerySchema } from "@/modules/materials/schemas/catalogue";
import { listMaterials } from "@/modules/materials/services/material-service";
import { requireIdentity } from "@/server/auth/authorize";

export default async function MaterialsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const identity = await requireIdentity();
  const query = listMaterialsQuerySchema.safeParse(await searchParams);
  if (!query.success) notFound();
  const [{ materials, pagination }, categories] = await Promise.all([
    listMaterials(identity, query.data), listCategories(identity, { includeArchived: "false" }),
  ]);
  const canManage = identity.membership.permissions.includes("material.manage");
  const archived = query.data.status === "ARCHIVED";
  const nextParams = new URLSearchParams();
  if (archived) nextParams.set("status", "ARCHIVED");
  if (query.data.categoryId) nextParams.set("categoryId", query.data.categoryId);
  if (query.data.q) nextParams.set("q", query.data.q);
  if (pagination.nextCursor) nextParams.set("cursor", pagination.nextCursor);

  return <div className="space-y-7">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">Workspace</p><h1 className="mt-1 text-3xl font-semibold">Materials</h1><p className="mt-2 text-slate-600">Your company-wide material catalogue and stock thresholds.</p></div><div className="flex gap-3"><Link className="rounded-md border border-slate-300 px-4 py-2.5 text-sm font-semibold" href="/materials/categories">Categories</Link>{canManage && <Link className="rounded-md bg-emerald-900 px-4 py-2.5 text-sm font-semibold text-white" href="/materials/new">Add material</Link>}</div></div>
    <div className="flex gap-4 border-b border-slate-200 pb-3 text-sm"><Link aria-current={!archived ? "page" : undefined} className={!archived ? "font-semibold text-emerald-900" : "text-slate-600"} href="/materials">Active</Link><Link aria-current={archived ? "page" : undefined} className={archived ? "font-semibold text-emerald-900" : "text-slate-600"} href="/materials?status=ARCHIVED">Archived</Link></div>
    <form className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4" method="get"><input name="status" type="hidden" value={query.data.status} /><label className="flex-1 text-sm font-medium">Search<input className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2" defaultValue={query.data.q ?? ""} maxLength={80} name="q" placeholder="Code or name" /></label><label className="text-sm font-medium">Category<select className="mt-1 block rounded-md border border-slate-300 bg-white px-3 py-2" defaultValue={query.data.categoryId ?? ""} name="categoryId"><option value="">All categories</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><button className="rounded-md bg-slate-800 px-4 py-2 text-sm font-semibold text-white" type="submit">Apply</button></form>
    {materials.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center"><h2 className="text-lg font-semibold">No {archived ? "archived" : "active"} materials found</h2><p className="mt-2 text-sm text-slate-600">{canManage && !archived ? "Create a category and add your first material." : "Try changing the filters."}</p></div> : <div className="grid gap-4 sm:grid-cols-2">{materials.map((material) => <Link className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-emerald-400 hover:shadow-md" href={`/materials/${material.id}`} key={material.id}><p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">{material.code}</p><h2 className="mt-1 text-lg font-semibold">{material.name}</h2><p className="mt-2 text-sm text-slate-600">{material.category.name} · {material.unit.replaceAll("_", " ")}</p><p className="mt-2 text-xs text-slate-500">Minimum stock: {material.minimumStockLevel}</p></Link>)}</div>}
    {pagination.hasMore && <Link className="inline-block rounded-md border border-slate-300 px-4 py-2 text-sm font-medium" href={`/materials?${nextParams.toString()}`}>Next page</Link>}
  </div>;
}
