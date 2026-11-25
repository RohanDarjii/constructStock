import type { Metadata } from "next";
import { ResetPasswordForm } from "@/modules/auth/components/reset-password-form";

export const metadata: Metadata = { referrer: "no-referrer" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string | string[] }> }) {
  const params = await searchParams;
  return <ResetPasswordForm token={typeof params.token === "string" ? params.token : ""} />;
}
