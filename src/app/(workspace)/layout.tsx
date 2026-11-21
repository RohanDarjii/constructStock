import Link from "next/link";

export default function WorkspaceLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <Link className="font-semibold text-emerald-700" href="/">ConstructStock</Link>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
    </>
  );
}
