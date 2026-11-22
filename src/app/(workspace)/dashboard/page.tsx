import Link from "next/link";

export default function DashboardPage() {
  return (
    <>
      <h1 className="text-3xl font-semibold">Dashboard</h1>
      <p className="mt-3 text-slate-600">Your workspace is ready. Set up your sites to organize future inventory and activity.</p>
      <Link className="mt-6 inline-block rounded-md bg-emerald-900 px-4 py-2.5 text-sm font-semibold text-white" href="/sites">Manage sites</Link>
    </>
  );
}
