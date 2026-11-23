"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { WorkspaceIcon } from "@/components/workspace/workspace-icon";
import type { OrganizationRole } from "@/server/auth/session-context";
import type { InvitationView, TeamMemberView } from "../types";

type SiteOption = { id: string; name: string; code: string };
type ApiResult<T> = { data?: T; error?: { message: string } };

async function mutation<T>(path: string, method: string, body?: unknown): Promise<T> {
  const csrfResponse = await fetch("/api/v1/auth/csrf", { cache: "no-store" });
  if (!csrfResponse.ok) throw new Error("Your session expired. Sign in again.");
  const csrf = await csrfResponse.json() as { data: { token: string } };
  const response = await fetch(path, {
    method,
    headers: { "X-CSRF-Token": csrf.data.token, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await response.json() as ApiResult<T>;
  if (!response.ok || !result.data) throw new Error(result.error?.message ?? "The change could not be saved.");
  return result.data;
}

function SiteChoices({ sites, selected, onChange }: { sites: SiteOption[]; selected: string[]; onChange: (ids: string[]) => void }) {
  return <div className="grid max-h-40 gap-2 overflow-y-auto rounded border border-[#eae7eb] bg-[#fbf8fc] p-3 sm:grid-cols-2">
    {sites.length ? sites.map((site) => <label className="flex items-center gap-2 text-xs" key={site.id}><input checked={selected.includes(site.id)} onChange={(event) => onChange(event.target.checked ? [...selected, site.id] : selected.filter((id) => id !== site.id))} type="checkbox" />{site.name} <span className="cs-muted">({site.code})</span></label>) : <p className="cs-muted text-xs">Create a site before assigning site access.</p>}
  </div>;
}

function MemberCard({ member, sites, managerRole, currentUserId }: { member: TeamMemberView; sites: SiteOption[]; managerRole: OrganizationRole; currentUserId: string }) {
  const router = useRouter();
  const [role, setRole] = useState<OrganizationRole>(member.role);
  const [selected, setSelected] = useState(member.siteIds);
  const [expanded, setExpanded] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const protectedMember = managerRole !== "OWNER" && (member.role === "OWNER" || member.role === "ADMIN");
  const self = member.id === currentUserId;

  async function apply(action: "role" | "sites" | "status") {
    setPending(true);
    setError("");
    try {
      if (action === "role") await mutation(`/api/v1/users/${member.id}/membership`, "PATCH", { role });
      if (action === "sites") await mutation(`/api/v1/users/${member.id}/sites`, "PUT", { siteIds: selected });
      if (action === "status") await mutation(`/api/v1/users/${member.id}/${member.status === "ACTIVE" ? "deactivate" : "reactivate"}`, "POST");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update team access.");
    } finally { setPending(false); }
  }

  return <article className="cs-panel p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="workspace-avatar !h-10 !w-10 !text-sm">{member.name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("")}</span>
        <div className="min-w-0"><h3 className="truncate text-sm font-bold">{member.name} {self && <span className="cs-muted text-xs font-normal">(you)</span>}</h3><p className="cs-muted truncate text-xs">{member.email ?? "User account unavailable"}</p></div>
      </div>
      <div className="flex items-center gap-2"><span className={`cs-badge ${member.status === "ACTIVE" ? "" : "cs-badge-quiet"}`}>{member.status.toLowerCase()}</span><button className="cs-secondary !min-h-8 !px-3" onClick={() => setExpanded(!expanded)} type="button">{expanded ? "Close" : "Manage"}</button></div>
    </div>
    <div className="cs-muted mt-3 flex flex-wrap gap-3 text-xs"><span>{member.role.replaceAll("_", " ")}</span><span>•</span><span>{member.missingUser ? "Account unavailable" : member.role === "OWNER" || member.role === "ADMIN" ? "All sites" : `${member.siteIds.length} assigned ${member.siteIds.length === 1 ? "site" : "sites"}`}</span></div>
    {expanded && <div className="mt-4 space-y-4 border-t border-[#f0edf1] pt-4">
      {protectedMember ? <p className="cs-muted text-xs">Only an Owner can change access for Owners and Admins.</p> : <>
        {member.missingUser ? <p className="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">This membership has no available user account. You can deactivate it; role and site changes are unavailable.</p> : <>
          <div className="flex flex-wrap items-end gap-3"><label className="cs-field min-w-48">Company role<select className="cs-input" disabled={pending || self} onChange={(event) => setRole(event.target.value as OrganizationRole)} value={role}>{(managerRole === "OWNER" ? ["OWNER", "ADMIN", "SITE_MANAGER", "STOREKEEPER"] : ["SITE_MANAGER", "STOREKEEPER"]).map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></label><button className="cs-secondary" disabled={pending || self || role === member.role} onClick={() => apply("role")} type="button">Save role</button></div>
          {member.status === "ACTIVE" && member.role !== "OWNER" && member.role !== "ADMIN" && <div className="space-y-2"><p className="cs-field">Assigned sites</p><SiteChoices onChange={setSelected} selected={selected} sites={sites} /><button className="cs-secondary" disabled={pending || [...selected].sort().join() === [...member.siteIds].sort().join()} onClick={() => apply("sites")} type="button">Save site access</button></div>}
        </>}
        <div className="border-t border-[#f0edf1] pt-3"><button className="text-xs font-semibold text-[#774149] underline" disabled={pending || self || (member.missingUser && member.status !== "ACTIVE")} onClick={() => apply("status")} type="button">{member.status === "ACTIVE" ? "Deactivate access" : "Reactivate access"}</button></div>
      </>}
      {error && <p aria-live="polite" className="rounded bg-red-50 p-2 text-xs text-red-700">{error}</p>}
    </div>}
  </article>;
}

export function TeamManager({ members, invitations, sites, managerRole, currentUserId }: { members: TeamMemberView[]; invitations: InvitationView[]; sites: SiteOption[]; managerRole: OrganizationRole; currentUserId: string }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [invitationUrl, setInvitationUrl] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setPending(true);
    setMessage("");
    setInvitationUrl("");
    const form = new FormData(formElement);
    try {
      const result = await mutation<{ invitationUrl: string }>("/api/v1/users/invitations", "POST", {
        name: String(form.get("name") ?? "").trim(), email: String(form.get("email") ?? "").trim(), role: String(form.get("role") ?? ""), siteIds: selected,
      });
      setInvitationUrl(result.invitationUrl);
      setSelected([]);
      formElement.reset();
      router.refresh();
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Could not invite member."); }
    finally { setPending(false); }
  }

  async function invitationAction(invitation: InvitationView, action: "resend" | "revoke") {
    setPending(true);
    setMessage("");
    setInvitationUrl("");
    try {
      const result = await mutation<{ invitationUrl: string } | InvitationView>(`/api/v1/users/invitations/${invitation.id}${action === "resend" ? "/resend" : ""}`, action === "resend" ? "POST" : "DELETE");
      if ("invitationUrl" in result) setInvitationUrl(result.invitationUrl);
      router.refresh();
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Could not update invitation."); }
    finally { setPending(false); }
  }

  return <div className="grid items-start gap-6 xl:grid-cols-[1.3fr_.7fr]"><section className="space-y-3"><div className="flex items-center justify-between"><h2 className="cs-section-title"><WorkspaceIcon name="users" />Members</h2><span className="cs-muted text-xs">{members.length} on this page</span></div>{members.length ? members.map((member) => <MemberCard currentUserId={currentUserId} key={`${member.id}:${member.role}:${member.status}:${member.siteIds.join(",")}`} managerRole={managerRole} member={member} sites={sites} />) : <div className="cs-panel p-6 text-sm">No members found.</div>}</section><aside className="space-y-6"><section className="cs-panel p-5"><h2 className="cs-section-title"><WorkspaceIcon name="plus" />Invite colleague</h2><p className="cs-muted mt-2 text-xs leading-5">Create a single-use link, then share it securely with the colleague named below. Links expire in seven days.</p><form className="mt-5 space-y-4" onSubmit={submit}><label className="cs-field">Full name<input className="cs-input" maxLength={120} minLength={2} name="name" required /></label><label className="cs-field">Work email<input className="cs-input" maxLength={254} name="email" required type="email" /></label><label className="cs-field">Role<select className="cs-input" defaultValue="STOREKEEPER" name="role">{(managerRole === "OWNER" ? ["ADMIN", "SITE_MANAGER", "STOREKEEPER"] : ["SITE_MANAGER", "STOREKEEPER"]).map((role) => <option key={role} value={role}>{role.replaceAll("_", " ")}</option>)}</select></label><div className="space-y-2"><p className="cs-field">Initial site access</p><SiteChoices onChange={setSelected} selected={selected} sites={sites} /></div><button className="cs-primary w-full disabled:opacity-50" disabled={pending} type="submit"><WorkspaceIcon className="h-4 w-4" name="mail" />{pending ? "Creating…" : "Create invitation"}</button></form>{invitationUrl && <div className="mt-4 rounded border border-[#d7dfda] bg-[#f1f7f2] p-3"><p className="text-xs font-bold text-[#144227]">Invitation link</p><p className="mt-1 break-all text-xs">{invitationUrl}</p><button className="mt-2 text-xs font-bold text-[#144227] underline" onClick={async () => { try { await navigator.clipboard.writeText(invitationUrl); setMessage("Invitation link copied."); } catch { setMessage("Copy the link above manually."); } }} type="button">Copy link</button></div>}{message && <p aria-live="polite" className="mt-3 rounded bg-[#f6f2f7] p-3 text-xs">{message}</p>}</section><section className="cs-panel p-5"><h2 className="cs-section-title"><WorkspaceIcon name="mail" />Invitations</h2><div className="mt-4 space-y-3">{invitations.length ? invitations.map((invitation) => <div className="rounded border border-[#eae7eb] p-3" key={invitation.id}><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-xs font-bold">{invitation.name}</p><p className="cs-muted truncate text-xs">{invitation.email}</p></div><span className={`cs-badge ${invitation.status === "PENDING" ? "cs-badge-amber" : "cs-badge-quiet"}`}>{invitation.status.toLowerCase()}</span></div><p className="cs-muted mt-2 text-xs">{invitation.role.replaceAll("_", " ")} · Expires {new Date(invitation.expiresAt).toLocaleDateString()}</p>{(invitation.status === "PENDING" || invitation.status === "EXPIRED") && (managerRole === "OWNER" || !["OWNER", "ADMIN"].includes(invitation.role)) && <div className="mt-3 flex gap-4"><button className="text-xs font-bold text-[#144227] underline disabled:opacity-50" disabled={pending} onClick={() => invitationAction(invitation, "resend")} type="button">New link</button><button className="text-xs font-bold text-[#774149] underline disabled:opacity-50" disabled={pending} onClick={() => invitationAction(invitation, "revoke")} type="button">Revoke</button></div>}</div>) : <p className="cs-muted text-xs">No invitations yet.</p>}</div></section></aside></div>;
}
