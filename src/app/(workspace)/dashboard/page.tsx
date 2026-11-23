import Link from "next/link";

export default function DashboardPage() {
  return (
    <>
      <h1 className="text-3xl font-semibold">Dashboard</h1>
      <p className="mt-3 text-slate-600">Set up your sites and materials, then track balances, batches, and stock movements in Inventory.</p>
      <div className="mt-6 flex gap-3"><Link className="inline-block rounded-md bg-emerald-900 px-4 py-2.5 text-sm font-semibold text-white" href="/inventory">View inventory</Link><Link className="inline-block rounded-md border border-slate-300 px-4 py-2.5 text-sm font-semibold" href="/sites">Manage sites</Link></div>
    </>
  );
}
