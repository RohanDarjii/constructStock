import "server-only";
import type { CurrentIdentity } from "@/modules/auth/services/auth-service";
import { AppError } from "@/shared/errors/app-error";
import { currentIdentity } from "./session";

export async function requireIdentity(): Promise<CurrentIdentity> {
  const identity = await currentIdentity();
  if (!identity) throw new AppError("UNAUTHENTICATED", "Sign in to continue.", 401);
  return identity;
}

export function requirePermission(identity: CurrentIdentity, permission: string): void {
  if (!identity.membership.permissions.includes(permission)) {
    throw new AppError("FORBIDDEN", "You do not have permission for this action.", 403);
  }
}

export function hasOrganizationWideSiteAccess(identity: CurrentIdentity): boolean {
  return identity.membership.permissions.includes("site.manage");
}

export function requireSiteAccess(identity: CurrentIdentity, siteId: string): void {
  if (!hasOrganizationWideSiteAccess(identity) && !identity.context.assignedSiteIds.includes(siteId.toLowerCase())) {
    throw new AppError("SITE_NOT_FOUND", "Site not found.", 404);
  }
}
