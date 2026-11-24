import Link from "next/link";
import { notFound } from "next/navigation";
import { WorkspaceIcon } from "@/components/workspace/workspace-icon";
import { balanceQuerySchema, batchQuerySchema, transactionQuerySchema } from "@/modules/inventory/schemas/inventory";
import { listBalances, listBatches, listInventoryFilters, listTransactions } from "@/modules/inventory/services/inventory-read-service";
import { requireIdentity } from "@/server/auth/authorize";

type Params = { view?: string; siteId?: string; materialId?: string; lowStock?: string; cursor?: string };
const views = ["balances", "batches", "history"] as const;

export default async function InventoryPage({ searchParams }: { searchParams: Promise<Params> }) {
  const identity = await requireIdentity();
  if (!identity.membership.permissions.includes("inventory.view")) notFound();
  const params = await searchParams;
  const selected = params.view ?? "balances";
  if (!views.includes(selected as typeof views[number])) notFound();
  const filters = { siteId: params.siteId || undefined, materialId: params.materialId || undefined, cursor: params.cursor || undefined };
  const query = selected === "balances"
    ? balanceQuerySchema.safeParse({ ...filters, lowStock: params.lowStock || undefined })
    : selected === "batches" ? batchQuerySchema.safeParse(filters) : transactionQuerySchema.safeParse(filters);
  if (!query.success) notFound();
  const options = await listInventoryFilters(identity);
  const result = selected === "balances"
    ? await listBalances(identity, balanceQuerySchema.parse({ ...filters, lowStock: params.lowStock || undefined }))
    : selected === "batches"
      ? await listBatches(identity, batchQuerySchema.parse(filters))
      : await listTransactions(identity, transactionQuerySchema.parse(filters));
  const next = new URLSearchParams();
  next.set("view", selected);
  if (params.siteId) next.set("siteId", params.siteId);
  if (params.materialId) next.set("materialId", params.materialId);
  if (selected === "balances" && params.lowStock) next.set("lowStock", params.lowStock);
  if (result.pagination.nextCursor) next.set("cursor", result.pagination.nextCursor);
  const tabHref = (view: string) => {
    const search = new URLSearchParams({ view });
    if (params.siteId) search.set("siteId", params.siteId);
    if (params.materialId) search.set("materialId", params.materialId);
    return `/inventory?${search.toString()}`;
  };
  const canAdjust = identity.membership.permissions.includes("inventory.adjust");

  return <div className="space-y-6">
    <div className="cs-eyebrow">Home / Operations / Inventory</div>
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="cs-eyebrow">● Site stock register</p><h1 className="mt-2 text-3xl font-extrabold">Inventory</h1><p className="cs-muted mt-1 max-w-2xl text-sm">Track available stock, costed batches, and the movement history for your authorized sites.</p></div>{canAdjust && <Link className="cs-primary" href="/inventory/adjustments/new"><WorkspaceIcon className="h-4 w-4" name="plus" />Stock adjustment</Link>}</header>
    <div className="cs-panel flex items-start gap-3 bg-[#f6f2f7] p-4"><WorkspaceIcon className="mt-0.5 h-5 w-5 shrink-0 text-[#144227]" name="shield" /><p className="text-xs leading-5 text-[#414942]">Available stock equals on-hand minus reserved stock. Every adjustment creates batch and ledger history. Confirmed goods receipts add stock through the same batch and ledger model.</p></div>
    <section className="cs-panel space-y-4 p-4"><div className="cs-tab-group">{views.map((view) => <Link aria-current={selected === view ? "page" : undefined} className={`cs-tab ${selected === view ? "cs-tab-active" : ""}`} href={tabHref(view)} key={view}>{view === "history" ? "History" : view[0].toUpperCase() + view.slice(1)}</Link>)}</div><form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]" method="get"><input name="view" type="hidden" value={selected} /><label className="cs-field">Site<select className="cs-input" defaultValue={params.siteId ?? ""} name="siteId"><option value="">All authorized sites</option>{options.sites.map((site) => <option key={site.id} value={site.id}>{site.code} · {site.name}</option>)}</select></label><label className="cs-field">Material<select className="cs-input" defaultValue={params.materialId ?? ""} name="materialId"><option value="">All materials</option>{options.materials.map((material) => <option key={material.id} value={material.id}>{material.code} · {material.name}</option>)}</select></label><button className="cs-secondary self-end" type="submit"><WorkspaceIcon className="h-4 w-4" name="filter" />Apply</button>{selected === "balances" && <label className="flex items-center gap-2 text-xs text-[#414942]"><input defaultChecked={params.lowStock === "true"} name="lowStock" type="checkbox" value="true" />Low stock only</label>}</form></section>
    {"balances" in result ? <section className="cs-panel overflow-x-auto"><table className="cs-data-table min-w-[800px]"><thead><tr><th>Site</th><th>Material</th><th>On hand</th><th>Reserved</th><th>Available</th><th>Value</th><th>Status</th></tr></thead><tbody>{result.balances.map((balance) => <tr key={balance.id}><td>{balance.site.name}</td><td><strong>{balance.material.name}</strong><span className="cs-muted block text-[11px]">{balance.material.code} · {balance.material.unit}</span></td><td>{balance.onHandQuantity}</td><td>{balance.reservedQuantity}</td><td className="font-bold">{balance.availableQuantity}</td><td>{identity.organization.currencyCode} {balance.inventoryValue}</td><td><span className={`cs-badge ${balance.lowStock ? "cs-badge-amber" : ""}`}>{balance.lowStock ? "Low stock" : "Available"}</span></td></tr>)}</tbody></table>{result.balances.length === 0 && <p className="cs-muted p-10 text-center text-sm">No stock balances match these filters. {canAdjust ? "Use a stock adjustment to record opening inventory." : "Stock will appear after receiving or an authorized adjustment."}</p>}</section> : "batches" in result ? <section className="cs-panel overflow-x-auto"><table className="cs-data-table min-w-[760px]"><thead><tr><th>Batch</th><th>Site</th><th>Material</th><th>Received</th><th>Remaining</th><th>Reserved</th><th>Unit cost</th><th>Status</th></tr></thead><tbody>{result.batches.map((batch) => <tr key={batch.id}><td className="font-mono font-semibold">{batch.batchCode}</td><td>{batch.site.name}</td><td>{batch.material.name}</td><td>{new Date(batch.receivedAt).toLocaleDateString()}</td><td className="font-bold">{batch.remainingQuantity} {batch.material.unit}</td><td>{batch.reservedQuantity}</td><td>{identity.organization.currencyCode} {batch.unitCost}</td><td><span className={`cs-badge ${batch.status === "ACTIVE" ? "" : "cs-badge-quiet"}`}>{batch.status.toLowerCase()}</span></td></tr>)}</tbody></table>{result.batches.length === 0 && <p className="cs-muted p-10 text-center text-sm">No batches match these filters.</p>}</section> : <section className="cs-panel overflow-x-auto"><table className="cs-data-table min-w-[760px]"><thead><tr><th>Time</th><th>Site</th><th>Material</th><th>Movement</th><th>Quantity</th><th>Batch</th><th>Reference</th></tr></thead><tbody>{result.transactions.map((transaction) => <tr key={transaction.id}><td>{new Date(transaction.createdAt).toLocaleString()}</td><td>{transaction.site.name}</td><td>{transaction.material.name}</td><td>{transaction.type.replaceAll("_", " ")}</td><td className="font-bold">{transaction.quantity} {transaction.material.unit}</td><td className="font-mono text-[11px]">{transaction.batchId?.slice(-12) ?? "—"}</td><td className="font-mono text-[11px]">{transaction.referenceId.slice(-12)}</td></tr>)}</tbody></table>{result.transactions.length === 0 && <p className="cs-muted p-10 text-center text-sm">No stock movements match these filters.</p>}</section>}
    {result.pagination.hasMore && <div className="flex justify-end"><Link className="cs-secondary" href={`/inventory?${next.toString()}`}>Next page <WorkspaceIcon className="h-4 w-4" name="arrow" /></Link></div>}
  </div>;
}
