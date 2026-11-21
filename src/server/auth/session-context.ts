import "server-only";

export type OrganizationRole = "OWNER" | "ADMIN" | "SITE_MANAGER" | "STOREKEEPER";

/** Created only after session, organization, membership, and status checks. */
export interface SessionContext {
  sessionId: string;
  userId: string;
  organizationId: string;
  membershipId: string;
  role: OrganizationRole;
  assignedSiteIds: readonly string[];
}
