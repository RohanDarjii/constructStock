import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/modules/auth/components/logout-button";
import { currentIdentity } from "@/server/auth/session";

export default async function WorkspaceLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const identity = await currentIdentity();
  if (!identity) redirect("/login");

  return (
    <>
      <header className="flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-6 py-4">
        <div><Link className="font-semibold text-emerald-900" href="/">ConstructStock</Link><p className="text-xs text-slate-500">{identity.organization.name} · {identity.membership.role}</p></div>
        <LogoutButton />
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
    </>
  );
}
