import Link from "next/link";
import { redirect } from "next/navigation";
import { PurchaseOrderForm } from "@/modules/purchasing/components/purchase-order-form";
import { listPurchaseOrderOptions } from "@/modules/purchasing/services/purchase-order-service";
import { requireIdentity } from "@/server/auth/authorize";

export default async function NewPurchaseOrderPage() {
  const identity = await requireIdentity();
  if (!identity.membership.permissions.includes("purchase_order.create")) redirect("/purchase-orders");
  const options = await listPurchaseOrderOptions(identity);
  return <div className="space-y-6"><div className="cs-eyebrow"><Link href="/purchase-orders">Purchase Orders</Link> / Create Purchase Order <span className="cs-badge ml-2">Draft mode</span></div><header><h1 className="text-3xl font-extrabold">New Purchase Order — Draft Mode</h1><p className="cs-muted mt-1 text-sm">Prepare material lines, commercial terms, and a delivery target for approval.</p></header>{options.sites.length && options.suppliers.length && options.materials.length ? <PurchaseOrderForm currencyCode={identity.organization.currencyCode} options={options} /> : <section className="cs-panel p-8"><h2 className="text-lg font-bold">Complete the procurement setup first</h2><p className="cs-muted mt-2 text-sm">You need an active site, supplier, and material before creating an order.</p><div className="mt-5 flex gap-3"><Link className="cs-secondary" href="/sites">Sites</Link><Link className="cs-secondary" href="/suppliers">Suppliers</Link><Link className="cs-secondary" href="/materials">Materials</Link></div></section>}</div>;
}
