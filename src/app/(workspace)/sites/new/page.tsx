import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteForm } from "@/modules/sites/components/site-form";
import { requireIdentity } from "@/server/auth/authorize";

export default async function NewSitePage() {
  const identity = await requireIdentity();
  if (!identity.membership.permissions.includes("site.manage")) redirect("/sites");
  return <div className="mx-auto max-w-4xl"><Link className="text-sm text-emerald-800 underline" href="/sites">← Back to sites</Link><h1 className="mt-4 text-3xl font-semibold">Create site</h1><p className="mt-2 mb-7 text-slate-600">Add the project details your team will use across inventory workflows.</p><SiteForm currencyCode={identity.organization.currencyCode} /></div>;
}
