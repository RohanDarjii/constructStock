import Link from "next/link";
import { notFound } from "next/navigation";
import { WorkspaceIcon } from "@/components/workspace/workspace-icon";
import { TeamManager } from "@/modules/users/components/team-manager";
import { listAssignableSites, listInvitations, listTeamMembers } from "@/modules/users/services/team-service";
import { requireIdentity } from "@/server/auth/authorize";

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ memberCursor?: string; invitationCursor?: string }> }) {
  const identity = await requireIdentity();
  if (!identity.membership.permissions.includes("user.manage")) notFound();
  const params = await searchParams;
  const validCursor = (value?: string) => value && /^[a-fA-F0-9]{24}$/.test(value) ? value : undefined;
  const [members, invitations, sites] = await Promise.all([
    listTeamMembers(identity, { limit: 25, cursor: validCursor(params.memberCursor) }),
    listInvitations(identity, { limit: 25, cursor: validCursor(params.invitationCursor) }),
    listAssignableSites(identity),
  ]);
  const memberNext = new URLSearchParams();
  if (members.pagination.nextCursor) memberNext.set("memberCursor", members.pagination.nextCursor);
  if (params.invitationCursor) memberNext.set("invitationCursor", params.invitationCursor);
  const invitationNext = new URLSearchParams();
  if (params.memberCursor) invitationNext.set("memberCursor", params.memberCursor);
  if (invitations.pagination.nextCursor) invitationNext.set("invitationCursor", invitations.pagination.nextCursor);

  return <div className="space-y-6">
    <div className="cs-eyebrow">Home / Administration / Team</div>
    <header><p className="cs-eyebrow">● Workspace access</p><h1 className="mt-2 text-3xl font-extrabold">Team &amp; access</h1><p className="cs-muted mt-1 max-w-2xl text-sm">Invite colleagues, set roles, and control which construction sites they can use.</p></header>
    <div className="cs-panel flex gap-3 p-4"><WorkspaceIcon className="h-5 w-5 shrink-0 text-[#144227]" name="shield" /><p className="text-xs leading-5 text-[#414942]">Owners and admins manage company members. Site managers and storekeepers receive access to assigned sites only. Changes take effect on the server.</p></div>
    <TeamManager currentUserId={identity.user.id} invitations={invitations.invitations} managerRole={identity.membership.role} members={members.members} sites={sites} />
    <div className="flex flex-wrap gap-3 text-xs">{members.pagination.hasMore && <Link className="cs-secondary" href={`/team?${memberNext.toString()}`}>More members <WorkspaceIcon className="h-4 w-4" name="arrow" /></Link>}{invitations.pagination.hasMore && <Link className="cs-secondary" href={`/team?${invitationNext.toString()}`}>More invitations <WorkspaceIcon className="h-4 w-4" name="arrow" /></Link>}</div>
  </div>;
}
