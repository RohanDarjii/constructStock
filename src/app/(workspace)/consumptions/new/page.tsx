import Link from "next/link";
import { notFound } from "next/navigation";
import { IssueForm } from "@/modules/consumption/components/issue-form";
import { getIssueOptions } from "@/modules/consumption/services/consumption-service";
import { requireIdentity } from "@/server/auth/authorize";

export default async function NewConsumptionPage() {
  const identity = await requireIdentity();
  if (!identity.membership.permissions.includes("inventory.consume")) notFound();
  const options = await getIssueOptions(identity);
  return <div className="space-y-6"><div className="cs-eyebrow"><Link href="/consumptions">Material Consumption</Link> / New Issue</div><header><p className="cs-eyebrow">Construction site stock</p><h1 className="mt-2 text-3xl font-extrabold">New Material Issue</h1><p className="cs-muted mt-1 max-w-2xl text-sm">Record material handed over for a construction activity. Confirmation deducts available stock from the selected site.</p></header>{options.sites.length ? <IssueForm canManual={identity.membership.permissions.includes("inventory.adjust")} currencyCode={identity.organization.currencyCode} initialOptions={options} /> : <section className="cs-panel p-10"><h2 className="text-lg font-bold">No active authorized sites</h2><p className="cs-muted mt-2 text-sm">An active site assignment is needed before material can be issued.</p><Link className="cs-secondary mt-5" href="/sites">View sites</Link></section>}</div>;
}
