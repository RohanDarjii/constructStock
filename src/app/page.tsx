import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col justify-center px-6 py-16">
      <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-emerald-700">
        ConstructStock
      </p>
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
        Construction inventory, built on a reliable ledger.
      </h1>
      <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
        A workspace for tracking materials across construction sites.
      </p>
      <div className="mt-8 flex gap-4 text-sm font-medium">
        <Link className="text-emerald-700 underline" href="/dashboard">Dashboard</Link>
        <Link className="text-slate-700 underline" href="/login">Sign in</Link>
      </div>
    </main>
  );
}
