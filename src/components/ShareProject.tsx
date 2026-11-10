"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Check, Copy, Eye, Link2, Loader2, LogOut, Pencil, Trash2, Users, X } from "lucide-react";
import { useSync } from "@/components/SyncProvider";
import { dialog } from "@/components/Dialog";
import { useOwnedShares, useSharedProject } from "@/hooks/useSharedProject";
import { getSupabase } from "@/lib/supabase";
import {
  createInvite,
  inviteUrl,
  listInvites,
  listMembers,
  removeMember,
  revokeInvite,
  setMemberRole,
  type MemberRole,
  type ProjectInvite,
  type ProjectMember,
} from "@/lib/sharing";

const ROLE_HINTS: Record<MemberRole, string> = {
  editor: "Can edit everything and delete assets",
  viewer: "Can look and export, not change anything",
};

const secondaryButton = { color: "var(--text-primary)", border: "1px solid var(--border)" };
const fieldStyle = { background: "var(--bg-primary)", color: "var(--text-primary)", border: "1px solid var(--border)" };

/** "Share" on the project dashboard: invite links and members for the owner, the member list and Leave for members. */
export function ShareButton({ projectId, projectName }: { projectId: string; projectName: string }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm shrink-0 max-md:flex-1"
        style={{ background: "var(--bg-card)", color: "var(--text-primary)", border: "1px solid var(--border-hover)" }}
        title="Invite people to work on this project with you"
      >
        <Users className="w-4 h-4" />
        Share
      </button>
      {isOpen &&
        createPortal(<ShareDialog projectId={projectId} projectName={projectName} onClose={() => setIsOpen(false)} />, document.body)}
    </>
  );
}

/**
 * Under the project title: who a shared project belongs to and your role, or how many people you shared yours with.
 * Clicking it opens the Share dialog. Nothing for projects that aren't shared.
 */
export function ShareStatus({ projectId, projectName }: { projectId: string; projectName: string }) {
  const shared = useSharedProject(projectId);
  const memberCount = useOwnedShares().get(projectId) ?? 0;
  const [isOpen, setIsOpen] = useState(false);
  if (!shared && !memberCount) return null;
  const RoleIcon = shared?.role === "viewer" ? Eye : Pencil;
  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="mt-2 inline-flex items-center gap-1.5 max-w-full px-2.5 py-1 rounded-full text-xs hover:brightness-125"
        style={{ background: "color-mix(in srgb, var(--accent) 14%, transparent)", color: "var(--text-primary)" }}
        title="See who has access"
      >
        <Users className="w-3.5 h-3.5 shrink-0" />
        {shared ? (
          <>
            <span className="truncate">Shared by {shared.ownerEmail || "the owner"}</span>
            <span className="shrink-0" style={{ color: "var(--text-secondary)" }}>·</span>
            <RoleIcon className="w-3 h-3 shrink-0" />
            <span className="shrink-0">You&apos;re {shared.role === "editor" ? "an editor" : "a viewer"}</span>
          </>
        ) : (
          <span>
            You shared this with {memberCount} {memberCount === 1 ? "person" : "people"}
          </span>
        )}
      </button>
      {isOpen && createPortal(<ShareDialog projectId={projectId} projectName={projectName} onClose={() => setIsOpen(false)} />, document.body)}
    </>
  );
}

function ShareDialog({ projectId, projectName, onClose: close }: { projectId: string; projectName: string; onClose(): void }) {
  const { user, refreshShared } = useSync();
  const shared = useSharedProject(projectId);
  // member changes made in the dialog show on the projects list and the dashboard once it closes
  const onClose = useCallback(() => {
    refreshShared().catch(() => {});
    close();
  }, [close, refreshShared]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-title"
    >
      <div
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl p-6 max-md:p-4 shadow-2xl"
        style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 mb-1">
          <h2 id="share-title" className="text-lg font-semibold truncate" style={{ color: "var(--text-primary)" }}>
            Share “{projectName}”
          </h2>
          <button onClick={onClose} style={{ color: "var(--text-muted)" }} title="Close" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        {!user ? (
          <p className="text-sm mt-3" style={{ color: "var(--text-secondary)" }}>
            Sign in (free) from the account panel in the sidebar to share projects. Projects kept only in this browser can&apos;t be shared.
          </p>
        ) : shared ? (
          <MemberSharing projectId={projectId} ownerId={shared.ownerId} ownerEmail={shared.ownerEmail} role={shared.role} userId={user.id} onLeft={onClose} />
        ) : (
          <OwnerSharing projectId={projectId} ownerId={user.id} />
        )}
      </div>
    </div>
  );
}

function OwnerSharing({ projectId, ownerId }: { projectId: string; ownerId: string }) {
  const { flushSaves } = useSync();
  const [isSaved, setIsSaved] = useState(false);

  // a project made a moment ago may not be in the cloud yet, and only saved projects can be shared
  useEffect(() => {
    flushSaves().finally(() => setIsSaved(true));
  }, [flushSaves]);

  if (!isSaved) return <Loading />;
  return (
    <>
      <p className="text-xs mb-4 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
        Anyone who opens an invite link while signed in joins this project. Links work for 7 days; revoke one any time. Members
        see each other&apos;s email addresses.
      </p>
      <InviteLinks projectId={projectId} />
      <MemberList projectId={projectId} ownerId={ownerId} canManage />
    </>
  );
}

function MemberSharing({ projectId, ownerId, ownerEmail, role, userId, onLeft }: {
  projectId: string;
  ownerId: string;
  ownerEmail: string;
  role: MemberRole;
  userId: string;
  onLeft(): void;
}) {
  const { leaveProject } = useSync();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function leave() {
    const confirmed = await dialog.confirm({
      title: "Leave project?",
      message: `You will lose access to this project until ${ownerEmail || "the owner"} invites you again. Nothing in it is deleted.`,
      confirmLabel: "Leave",
      danger: true,
    });
    if (!confirmed) return;
    const failure = await leaveProject(projectId);
    if (failure) return setError(failure);
    onLeft();
    router.push("/projects");
  }

  return (
    <>
      <p className="text-xs mb-4 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
        {ownerEmail || "The owner"} shared this project with you as {role === "editor" ? "an editor" : "a viewer"}. Only the owner can
        invite people.
      </p>
      <MemberList projectId={projectId} ownerId={ownerId} canManage={false} currentUserId={userId} />
      {error && <ErrorLine message={error} />}
      <button onClick={leave} className="mt-4 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm" style={{ color: "var(--red)", border: "1px solid var(--border)" }}>
        <LogOut className="w-4 h-4" />
        Leave project
      </button>
    </>
  );
}

function InviteLinks({ projectId }: { projectId: string }) {
  const [invites, setInvites] = useState<ProjectInvite[] | null>(null);
  const [role, setRole] = useState<MemberRole>("editor");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listInvites(getSupabase()!, projectId)
      .then(setInvites)
      .catch((err: Error) => setError(err.message));
  }, [projectId]);

  async function create() {
    setIsCreating(true);
    setError(null);
    try {
      const invite = await createInvite(getSupabase()!, projectId, role);
      setInvites((current) => [...(current ?? []), invite]);
      await copyLink(invite.token);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsCreating(false);
    }
  }

  async function revoke(token: string) {
    try {
      await revokeInvite(getSupabase()!, token);
      setInvites((current) => (current ?? []).filter((i) => i.token !== token));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <section className="mb-5">
      <h3 className="text-sm font-medium mb-2" style={{ color: "var(--text-primary)" }}>
        Invite links
      </h3>
      <div className="flex gap-2 max-md:flex-col">
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as MemberRole)}
          aria-label="Role for people who join with the new link"
          className="flex-1 min-w-0 px-2 py-1.5 rounded-lg text-sm outline-none"
          style={fieldStyle}
        >
          <option value="editor" title={ROLE_HINTS.editor}>Editor: can edit</option>
          <option value="viewer" title={ROLE_HINTS.viewer}>Viewer: view only</option>
        </select>
        <button
          onClick={create}
          disabled={isCreating}
          className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap shrink-0 disabled:opacity-60"
          style={{ background: "var(--accent)", color: "var(--on-accent, white)" }}
        >
          {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
          Create and copy link
        </button>
      </div>
      {error && <ErrorLine message={error} />}
      {invites === null ? (
        <Loading />
      ) : (
        invites.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {invites.map((invite) => (
              <InviteRow key={invite.token} invite={invite} onRevoke={() => revoke(invite.token)} />
            ))}
          </ul>
        )
      )}
    </section>
  );
}

async function copyLink(token: string) {
  await navigator.clipboard?.writeText(inviteUrl(window.location.origin, token)).catch(() => {});
}

function InviteRow({ invite, onRevoke }: { invite: ProjectInvite; onRevoke(): void }) {
  const [isCopied, setIsCopied] = useState(false);
  const url = inviteUrl(window.location.origin, invite.token);
  return (
    <li className="flex items-center gap-2 text-xs min-w-0" style={{ color: "var(--text-secondary)" }}>
      <input readOnly value={url} aria-label={`${invite.role} invite link`} onFocus={(e) => e.target.select()} className="flex-1 min-w-0 px-2 py-1 rounded-md" style={fieldStyle} />
      <span className="shrink-0 capitalize">{invite.role}</span>
      <span className="shrink-0 max-md:hidden">until {new Date(invite.expiresAt).toLocaleDateString()}</span>
      <button
        onClick={async () => {
          await copyLink(invite.token);
          setIsCopied(true);
        }}
        className="p-1.5 rounded-md shrink-0"
        style={secondaryButton}
        title="Copy link"
        aria-label="Copy link"
      >
        {isCopied ? <Check className="w-3.5 h-3.5" style={{ color: "var(--green)" }} /> : <Copy className="w-3.5 h-3.5" />}
      </button>
      <button onClick={onRevoke} className="p-1.5 rounded-md shrink-0" style={{ ...secondaryButton, color: "var(--red)" }} title="Revoke link" aria-label="Revoke link">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </li>
  );
}

function MemberList({ projectId, ownerId, canManage, currentUserId }: {
  projectId: string;
  ownerId: string;
  canManage: boolean;
  currentUserId?: string;
}) {
  const [members, setMembers] = useState<ProjectMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => listMembers(getSupabase()!, ownerId, projectId).then(setMembers), [ownerId, projectId]);

  useEffect(() => {
    load().catch((err: Error) => setError(err.message));
  }, [load]);

  async function change(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function remove(member: ProjectMember) {
    const confirmed = await dialog.confirm({
      title: "Remove member?",
      message: `${member.email} loses access to this project. What they made stays in it.`,
      confirmLabel: "Remove",
      danger: true,
    });
    if (confirmed) await change(() => removeMember(getSupabase()!, ownerId, projectId, member.userId));
  }

  return (
    <section>
      <h3 className="text-sm font-medium mb-2" style={{ color: "var(--text-primary)" }}>
        People with access
      </h3>
      {error && <ErrorLine message={error} />}
      {members === null ? (
        <Loading />
      ) : (
        <ul className="space-y-1.5">
          {members.map((member) => (
            <li key={member.userId} className="flex items-center gap-2 text-sm min-w-0">
              <span className="flex-1 min-w-0 truncate" style={{ color: "var(--text-primary)" }}>
                {member.email || "Unknown account"}
                {member.userId === currentUserId && <span style={{ color: "var(--text-muted)" }}> (you)</span>}
              </span>
              {canManage && member.role !== "owner" ? (
                <>
                  <select
                    value={member.role}
                    onChange={(e) => change(() => setMemberRole(getSupabase()!, projectId, member.userId, e.target.value as MemberRole))}
                    aria-label={`Role of ${member.email}`}
                    className="px-2 py-1 rounded-md text-xs outline-none"
                    style={fieldStyle}
                  >
                    <option value="editor">Editor</option>
                    <option value="viewer">Viewer</option>
                  </select>
                  <button onClick={() => remove(member)} className="p-1.5 rounded-md shrink-0" style={{ ...secondaryButton, color: "var(--red)" }} title="Remove from project" aria-label={`Remove ${member.email}`}>
                    <X className="w-3.5 h-3.5" />
                  </button>
                </>
              ) : (
                <span className="text-xs capitalize shrink-0" style={{ color: "var(--text-secondary)" }}>
                  {member.role}
                </span>
              )}
            </li>
          ))}
          {canManage && members.length === 1 && (
            <li className="text-xs" style={{ color: "var(--text-muted)" }}>
              Only you so far. Send someone an invite link.
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

function Loading() {
  return <Loader2 className="w-4 h-4 animate-spin mt-2" style={{ color: "var(--text-muted)" }} />;
}

function ErrorLine({ message }: { message: string }) {
  return (
    <p className="mt-2 text-xs" role="alert" style={{ color: "var(--red)" }}>
      {message}
    </p>
  );
}

/** Shown above every tool in a project the user can only view: their changes stay in this tab and are not saved. */
export function ViewOnlyBanner({ projectId }: { projectId: string }) {
  const shared = useSharedProject(projectId);
  if (shared?.role !== "viewer") return null;
  return (
    <div className="px-4 py-1.5 text-xs text-center" role="status" style={{ background: "color-mix(in srgb, var(--yellow) 14%, var(--bg-secondary))", color: "var(--text-primary)" }}>
      View only: {shared.ownerEmail || "the owner"} shared this project with you as a viewer, so changes you make here are not saved.
    </div>
  );
}
