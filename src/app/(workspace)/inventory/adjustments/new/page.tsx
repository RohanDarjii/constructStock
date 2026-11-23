import Link from "next/link";
import { notFound } from "next/navigation";
import { WorkspaceIcon } from "@/components/workspace/workspace-icon";
import { AdjustmentForm } from "@/modules/inventory/components/adjustment-form";
import { listAdjustmentOptions } from "@/modules/inventory/services/inventory-adjustment-service";
import { requireIdentity } from "@/server/auth/authorize";

export default async function NewAdjustmentPage() {
  const identity = await requireIdentity();
  if (!identity.membership.permissions.includes("inventory.adjust")) notFound();
  const options = await listAdjustmentOptions(identity);
  return <div className="space-y-6">
    <div className="cs-eyebrow">Home / Operations / Inventory / Adjustment</div>
    <header><Link className="cs-muted text-xs font-semibold hover:underline" href="/inventory">← Back to inventory</Link><p className="cs-eyebrow mt-4">● Controlled stock entry</p><h1 className="mt-2 text-3xl font-extrabold">Stock adjustment</h1><p className="cs-muted mt-1 max-w-2xl text-sm">Record opening stock or correct a physical count. Every change is audited and written to the inventory ledger.</p></header>
    {options.sites.length && options.materials.length ? <AdjustmentForm currencyCode={identity.organization.currencyCode} materials={options.materials} sites={options.sites} /> : <section className="cs-panel p-8"><WorkspaceIcon className="h-8 w-8 text-[#144227]" name="inventory" /><h2 className="mt-3 text-lg font-bold">Set up a site and material first</h2><p className="cs-muted mt-2 text-sm">Stock adjustments need an active site and an active material.</p><div className="mt-5 flex gap-3"><Link className="cs-secondary" href="/sites">Sites</Link><Link className="cs-secondary" href="/materials">Materials</Link></div></section>}
  </div>;
}
