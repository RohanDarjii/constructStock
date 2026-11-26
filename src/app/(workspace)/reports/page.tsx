import Link from "next/link";
import { notFound } from "next/navigation";
import { WorkspaceIcon } from "@/components/workspace/workspace-icon";
import { reportKindSchema, reportKinds, reportQuerySchema } from "@/modules/reports/schemas/report";
import { getReport, getReportOptions } from "@/modules/reports/services/report-service";
import { requireIdentity } from "@/server/auth/authorize";
import { AppError } from "@/shared/errors/app-error";

const labels: Record<(typeof reportKinds)[number], string> = { inventory: "Inventory", purchases: "Purchases", consumption: "Consumption", wastage: "Wastage", suppliers: "Suppliers", sites: "Site activity" };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const identity = await requireIdentity();
  if (!identity.membership.permissions.includes("reports.view")) notFound();
  const params = await searchParams;
  const kind = reportKindSchema.safeParse(params.type ?? "inventory");
  const parsed = reportQuerySchema.safeParse({ from: params.from, to: params.to, siteId: params.siteId, materialId: params.materialId, categoryId: params.categoryId, supplierId: params.supplierId });
  if (!kind.success || !parsed.success) notFound();
  const options = await getReportOptions(identity);
  let report: Awaited<ReturnType<typeof getReport>> | null = null;
  let reportError: string | null = null;
  if (kind.data !== "sites" || parsed.data.siteId) {
    try { report = await getReport(identity, kind.data, parsed.data); }
    catch (error) { if (!(error instanceof AppError) || !["REPORT_TOO_LARGE", "VALIDATION_ERROR", "SITE_NOT_FOUND"].includes(error.code)) throw error; reportError = error.message; }
  }
  const filters = new URLSearchParams();
  for (const key of ["from", "to", "siteId", "materialId", "categoryId", "supplierId"] as const) if (parsed.data[key]) filters.set(key, parsed.data[key]);
  const endpoint = kind.data === "sites" ? `/api/v1/reports/sites/${parsed.data.siteId}/export` : `/api/v1/reports/${kind.data}/export`;
  return <div className="space-y-6 pb-6">
    <header><p className="cs-eyebrow">Workspace / Analytics</p><h1 className="mt-2 text-3xl font-extrabold">Reports &amp; exports</h1><p className="cs-muted mt-1 text-sm">Review current stock and operational history for the sites you can access.</p></header>
    <nav aria-label="Report types" className="flex flex-wrap gap-2">{reportKinds.map((item) => <Link aria-current={kind.data === item ? "page" : undefined} className={kind.data === item ? "cs-primary" : "cs-secondary"} href={`/reports?type=${item}`} key={item}>{labels[item]}</Link>)}</nav>
    <form className="cs-panel grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-6" method="get"><input name="type" type="hidden" value={kind.data} /><label className="cs-field">From<input className="cs-input" defaultValue={parsed.data.from ?? ""} name="from" type="date" /></label><label className="cs-field">To<input className="cs-input" defaultValue={parsed.data.to ?? ""} name="to" type="date" /></label><label className="cs-field">Site<select className="cs-input" defaultValue={parsed.data.siteId ?? ""} name="siteId"><option value="">{kind.data === "sites" ? "Choose a site" : "All accessible sites"}</option>{options.sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select></label><label className="cs-field">Material<select className="cs-input" defaultValue={parsed.data.materialId ?? ""} name="materialId"><option value="">All materials</option>{options.materials.map((material) => <option key={material.id} value={material.id}>{material.name}</option>)}</select></label><label className="cs-field">Category<select className="cs-input" defaultValue={parsed.data.categoryId ?? ""} name="categoryId"><option value="">All categories</option>{options.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>{["purchases", "suppliers"].includes(kind.data) && <label className="cs-field">Supplier<select className="cs-input" defaultValue={parsed.data.supplierId ?? ""} name="supplierId"><option value="">All suppliers</option>{options.suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>}<button className="cs-primary xl:col-start-6" type="submit"><WorkspaceIcon className="h-4 w-4" name="filter" />Apply filters</button></form>
    {reportError && <section className="cs-panel p-8"><h2 className="text-lg font-extrabold">Report unavailable</h2><p className="cs-muted mt-2 text-sm">{reportError}</p></section>}
    {!report && !reportError && <section className="cs-panel p-8 text-center"><h2 className="font-bold">Choose a site to view its activity</h2><p className="cs-muted mt-2 text-sm">The site report includes inventory ledger movements for the selected period.</p></section>}
    {report && <><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-xl font-extrabold">{report.title}</h2><p className="cs-muted mt-1 text-xs">{kind.data === "inventory" ? "Current balances" : `${report.filters.from} to ${report.filters.to} · UTC`} · {report.totalRows} rows</p></div><div className="flex gap-2">{report.totalRows <= 500 && <a className="cs-secondary" href={`${endpoint}?${new URLSearchParams([...filters, ["format", "pdf"]]).toString()}`}>Download PDF</a>}<a className="cs-primary" href={`${endpoint}?${new URLSearchParams([...filters, ["format", "xlsx"]]).toString()}`}>Download Excel</a></div></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{report.summary.map((item) => <section className="cs-panel p-5" key={item.label}><p className="cs-stat-label">{item.label}</p><p className="mt-3 text-2xl font-extrabold tabular-nums">{item.value}</p></section>)}</div><section className="cs-panel overflow-x-auto">{report.rows.length ? <table className="cs-data-table min-w-[760px]"><thead><tr>{report.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{report.rows.slice(0, 100).map((row, index) => <tr key={index}>{row.map((value, column) => <td key={column}>{value}</td>)}</tr>)}</tbody></table> : <p className="cs-muted p-10 text-center text-sm">No matching records for this report.</p>}</section>{report.rows.length > 100 && <p className="cs-muted text-xs">Showing the first 100 rows here. Download Excel for all {report.totalRows} rows.</p>}{report.rows.length > 500 && <p className="cs-muted text-xs">PDF export supports up to 500 rows; narrow the filters for a PDF.</p>}</>}
  </div>;
}
