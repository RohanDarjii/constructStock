import Link from "next/link";
import { notFound } from "next/navigation";
import { WorkspaceIcon } from "@/components/workspace/workspace-icon";
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
  const next = new URLSearchParams();
  if (archived) next.set("status", "ARCHIVED");
  if (query.data.categoryId) next.set("categoryId", query.data.categoryId);
  if (query.data.q) next.set("q", query.data.q);
  if (pagination.nextCursor) next.set("cursor", pagination.nextCursor);

  return <div className="space-y-6">
    <div className="cs-eyebrow">Home / Catalogue / Materials</div>
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="cs-eyebrow">Company-wide master catalogue</p><h1 className="mt-2 text-3xl font-extrabold">Materials <span className="rounded bg-[#eae7eb] px-2 py-1 align-middle text-[10px] font-bold uppercase tracking-wider text-[#58605c]">Master catalogue</span></h1><p className="cs-muted mt-1 max-w-2xl text-sm">Approved construction materials, measurement units, and baseline reorder levels.</p></div><div className="flex flex-wrap gap-2"><Link className="cs-secondary" href="/materials/categories"><WorkspaceIcon className="h-4 w-4" name="materials" />Manage categories</Link>{canManage && <Link className="cs-primary" href="/materials/new"><WorkspaceIcon className="h-4 w-4" name="plus" />Add material</Link>}</div></header>
    <section className="cs-panel flex items-start gap-4 p-5"><div className="grid h-10 w-10 shrink-0 place-items-center rounded bg-[#d7dfda] text-[#144227]"><WorkspaceIcon className="h-5 w-5" name="check" /></div><div><h2 className="text-sm font-bold">Master catalogue registry</h2><p className="cs-muted mt-1 text-xs leading-5">This registry defines company-wide material specifications and reorder buffers. Live site balances and receipts belong to future inventory and receiving workflows.</p></div></section>
    <div className="space-y-3"><div className="cs-tab-group"><Link aria-current={!archived ? "page" : undefined} className={"cs-tab " + (!archived ? "cs-tab-active" : "")} href="/materials">Active materials</Link><Link aria-current={archived ? "page" : undefined} className={"cs-tab " + (archived ? "cs-tab-active" : "")} href="/materials?status=ARCHIVED">Archived</Link></div><form className="cs-panel grid gap-3 p-3 sm:grid-cols-[1fr_220px_auto]" method="get"><input name="status" type="hidden" value={query.data.status} /><label className="relative"><span className="sr-only">Search materials</span><WorkspaceIcon className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-[#58605c]" name="search" /><input className="cs-input pl-9" defaultValue={query.data.q ?? ""} maxLength={80} name="q" placeholder="Search by material code or name" /></label><label><span className="sr-only">Category</span><select className="cs-input" defaultValue={query.data.categoryId ?? ""} name="categoryId"><option value="">All categories</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><button className="cs-secondary" type="submit"><WorkspaceIcon className="h-4 w-4" name="filter" />Apply</button></form></div>
    {materials.length === 0 ? <section className="cs-panel p-12 text-center"><WorkspaceIcon className="mx-auto h-9 w-9 text-[#144227]" name="materials" /><h2 className="mt-3 text-lg font-bold">No {archived ? "archived" : "active"} materials found</h2><p className="cs-muted mt-2 text-sm">{canManage && !archived && !query.data.q ? "Create a category and add your first material." : "Try another search or category."}</p></section> : <div className="cs-panel overflow-x-auto"><table className="cs-data-table min-w-[800px]"><thead><tr><th>Material code &amp; specification</th><th>Category</th><th>Unit of measure</th><th>Minimum stock</th><th>Default reorder</th><th>Status</th><th><span className="sr-only">Open</span></th></tr></thead><tbody>{materials.map((material) => <tr key={material.id}><td><Link className="flex items-center gap-3" href={"/materials/" + material.id}><span className="grid h-9 w-9 shrink-0 place-items-center rounded bg-[#eae7eb] text-[#144227]"><WorkspaceIcon className="h-4 w-4" name="package" /></span><span><span className="block font-mono text-[10px] font-bold text-[#144227]">{material.code}</span><span className="block max-w-[250px] truncate font-bold text-[#1b1b1e]">{material.name}</span>{material.description && <span className="cs-muted block max-w-[250px] truncate text-[11px]">{material.description}</span>}</span></Link></td><td><span className="rounded bg-[#f0edf1] px-2 py-1 text-[11px] font-semibold text-[#414942]">{material.category.name}</span></td><td className="font-semibold">{material.unit.replaceAll("_", " ")}</td><td className="font-mono font-semibold">{material.minimumStockLevel}</td><td className="font-mono">{material.defaultReorderQuantity ?? "Not set"}</td><td><span className={"cs-badge " + (archived ? "cs-badge-quiet" : "")}>{material.status === "ACTIVE" ? "Active" : "Archived"}</span></td><td><Link className="font-bold text-[#144227] hover:underline" href={"/materials/" + material.id}>View</Link></td></tr>)}</tbody></table></div>}
    <div className="flex items-center justify-between gap-3 text-xs text-[#58605c]"><span>Showing {materials.length} {materials.length === 1 ? "material" : "materials"} on this page</span>{pagination.hasMore && <Link className="cs-secondary" href={"/materials?" + next.toString()}>Next page <WorkspaceIcon className="h-4 w-4" name="arrow" /></Link>}</div>
  </div>;
}
