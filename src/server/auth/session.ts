import "server-only";
import { cookies } from "next/headers";
import { identityFromSessionToken } from "@/modules/auth/services/auth-service";

export const SESSION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-constructstock-session" : "constructstock-session";
const maxAge = 7 * 24 * 60 * 60;

export async function sessionTokenFromCookie(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

export async function currentIdentity() {
  return identityFromSessionToken(await sessionTokenFromCookie());
}

export async function setSessionCookie(token: string): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge,
  });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
