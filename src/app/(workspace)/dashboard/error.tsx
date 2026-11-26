"use client";

import Link from "next/link";

export default function DashboardError({ retry }: { error: Error; retry: () => void }) {
  return <section className="cs-panel p-8" role="alert">
    <h1 className="text-xl font-extrabold">Dashboard could not load</h1>
    <p className="cs-muted mt-2 text-sm">The latest workspace data is temporarily unavailable. Please try again.</p>
    <div className="mt-5 flex flex-wrap gap-2">
      <button className="cs-primary" onClick={retry} type="button">Retry dashboard</button>
      <Link className="cs-secondary" href="/inventory">Open inventory</Link>
    </div>
  </section>;
}
