import "server-only";
import { getAuthEnv, getEmailEnv } from "@/server/config/env";

export class EmailDeliveryError extends Error {
  constructor(public readonly statusCode: number, public readonly providerCode?: string) {
    super("Password reset email provider rejected the request.");
    this.name = "EmailDeliveryError";
  }
}

export async function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  const { RESEND_API_KEY, EMAIL_FROM } = getEmailEnv();
  const url = new URL("/reset-password", getAuthEnv().APP_URL);
  url.searchParams.set("token", token);
  const link = url.toString();
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: [to],
      subject: "Reset your ConstructStock password",
      text: `We received a request to reset your ConstructStock password. Open this link within 30 minutes: ${link}\n\nIf you did not request this, you can ignore this email.`,
      html: `<p>We received a request to reset your ConstructStock password.</p><p><a href="${link}">Reset password</a></p><p>This link expires in 30 minutes. If you did not request this, you can ignore this email.</p>`,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const name = typeof body === "object" && body !== null && "name" in body ? body.name : undefined;
    const providerCode = typeof name === "string" && /^[A-Za-z_]{1,40}$/.test(name) ? name : undefined;
    throw new EmailDeliveryError(response.status, providerCode);
  }
}
