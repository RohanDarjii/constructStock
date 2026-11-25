import Link from "next/link";
import { notFound } from "next/navigation";
import { WastageForm } from "@/modules/wastage/components/wastage-form";
import { getWastageOptions } from "@/modules/wastage/services/wastage-service";
import { requireIdentity } from "@/server/auth/authorize";

export default async function NewWastagePage() {
  const identity = await requireIdentity();
  if (!identity.membership.permissions.includes("wastage.create")) notFound();
  const options = await getWastageOptions(identity);
  return <div className="space-y-6"><div className="cs-eyebrow"><Link href="/wastages">Material Wastage</Link> / New Record</div><header><p className="cs-eyebrow">Site stock loss</p><h1 className="mt-2 text-3xl font-extrabold">Record Material Wastage</h1><p className="cs-muted mt-1 max-w-2xl text-sm">Describe what was lost, review FIFO batches, and confirm the stock write-off.</p></header>{options.sites.length ? <WastageForm canManual={identity.membership.permissions.includes("inventory.adjust")} currencyCode={identity.organization.currencyCode} initialOptions={options} /> : <section className="cs-panel p-10"><h2 className="text-lg font-bold">No active authorized sites</h2><p className="cs-muted mt-2 text-sm">An active site assignment is needed to record wastage.</p><Link className="cs-secondary mt-5" href="/sites">View sites</Link></section>}</div>;
}
