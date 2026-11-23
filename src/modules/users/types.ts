import type { OrganizationRole } from "@/server/auth/session-context";

export interface TeamMemberView {
  id: string;
  name: string;
  email: string | null;
  missingUser: boolean;
  role: OrganizationRole;
  status: "ACTIVE" | "INACTIVE" | "INVITED";
  siteIds: string[];
  joinedAt: string | null;
}

export interface InvitationView {
  id: string;
  name: string;
  email: string;
  role: OrganizationRole;
  siteIds: string[];
  status: "PENDING" | "EXPIRED" | "ACCEPTED" | "REVOKED";
  expiresAt: string;
  createdAt: string;
}
