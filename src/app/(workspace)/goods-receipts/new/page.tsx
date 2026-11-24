import Link from "next/link";
import { notFound } from "next/navigation";
import { WorkspaceIcon } from "@/components/workspace/workspace-icon";
import { GoodsReceiptForm } from "@/modules/receiving/components/goods-receipt-form";
import { getPurchaseOrder } from "@/modules/purchasing/services/purchase-order-service";
import { listReceivableOrders } from "@/modules/receiving/services/goods-receipt-service";
import { requireIdentity } from "@/server/auth/authorize";
import { AppError } from "@/shared/errors/app-error";

export default async function NewGoodsReceiptPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const identity = await requireIdentity();
  if (!identity.membership.permissions.includes("inventory.receive")) notFound();
  const params = await searchParams;
  if (Array.isArray(params.poId) || Array.isArray(params.q)) notFound();
  const poId = params.poId;
  const q = params.q ?? "";
  if (poId) {
    let order: Awaited<ReturnType<typeof getPurchaseOrder>>;
    try { order = await getPurchaseOrder(identity, poId); }
    catch (error) { if (error instanceof AppError && error.status === 404) notFound(); throw error; }
    return <div className="space-y-6"><div className="cs-eyebrow"><Link href="/goods-receipts">Goods Receipts</Link> / <Link href={`/purchase-orders/${order.id}`}>{order.poNumber}</Link> / Record delivery</div><header><p className="cs-eyebrow">Physical inward</p><h1 className="mt-2 text-3xl font-extrabold">Record Delivery</h1><p className="cs-muted mt-1 text-sm">Confirm materials received at {order.site.name}. Stock updates when you submit.</p></header>{["ORDERED", "PARTIALLY_RECEIVED"].includes(order.status) ? <GoodsReceiptForm currencyCode={order.currencyCode} order={order} /> : <section className="cs-panel p-8"><h2 className="text-lg font-bold">This order cannot receive a delivery</h2><p className="cs-muted mt-2 text-sm">Goods receiving is available only while an order is ordered or partially received.</p><Link className="cs-secondary mt-5" href={`/purchase-orders/${order.id}`}>View purchase order</Link></section>}</div>;
  }
  const search = q.trim().slice(0, 80);
  const orders = await listReceivableOrders(identity, search);
  return <div className="space-y-6"><div className="cs-eyebrow"><Link href="/goods-receipts">Goods Receipts</Link> / Select Purchase Order</div><header><p className="cs-eyebrow">Start receiving</p><h1 className="mt-2 text-3xl font-extrabold">Choose an ordered purchase order</h1><p className="cs-muted mt-1 text-sm">Deliveries can be recorded only for ordered or partially received POs at your authorized sites.</p></header><form className="cs-panel flex flex-wrap items-end gap-3 p-5" method="get"><label className="cs-field min-w-[220px] flex-1">Purchase order number<input className="cs-input" defaultValue={search} maxLength={80} name="q" placeholder="Search PO number" /></label><button className="cs-secondary" type="submit"><WorkspaceIcon className="h-4 w-4" name="search" />Search</button></form>{orders.length ? <section className="cs-panel overflow-x-auto"><table className="cs-data-table min-w-[650px]"><thead><tr><th>Purchase order</th><th>Site</th><th>Supplier</th><th>Status</th><th><span className="sr-only">Select</span></th></tr></thead><tbody>{orders.map((order) => <tr key={order.id}><td className="font-mono font-bold">{order.poNumber}</td><td>{order.site.name}</td><td>{order.supplier.name}</td><td><span className="cs-badge">{order.status.replaceAll("_", " ")}</span></td><td><Link className="font-semibold text-[#144227] hover:underline" href={`/goods-receipts/new?poId=${order.id}`}>Record delivery</Link></td></tr>)}</tbody></table></section> : <section className="cs-panel p-10 text-center"><h2 className="font-bold">No eligible purchase orders found</h2><p className="cs-muted mt-2 text-sm">Try another PO number or mark an approved order as ordered.</p><Link className="cs-secondary mt-5" href="/purchase-orders">View purchase orders</Link></section>}</div>;
}
