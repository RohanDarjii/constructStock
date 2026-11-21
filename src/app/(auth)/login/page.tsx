import Link from "next/link";

export default function LoginPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <p className="mt-3 text-slate-600">Sign-in will be available in the authentication milestone.</p>
      <div className="mt-6 flex gap-4 text-sm">
        <Link className="text-emerald-700 underline" href="/register-company">Register a company</Link>
        <Link className="text-emerald-700 underline" href="/forgot-password">Forgot password</Link>
      </div>
    </>
  );
}
