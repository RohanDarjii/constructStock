import "server-only";
import type { CurrentIdentity } from "@/modules/auth/services/auth-service";
import { verifyCsrf } from "@/modules/auth/services/security";
import { requireIdentity } from "@/server/auth/authorize";
import { sessionTokenFromCookie } from "@/server/auth/session";
import { AppError } from "@/shared/errors/app-error";
import { assertAllowedOrigin } from "./auth-route";

export async function requireMutationIdentity(request: Request): Promise<CurrentIdentity> {
  assertAllowedOrigin(request);
  const identity = await requireIdentity();
  const token = await sessionTokenFromCookie();
  if (!token) throw new AppError("UNAUTHENTICATED", "Sign in to continue.", 401);
  verifyCsrf(token, request.headers.get("x-csrf-token"));
  return identity;
}
