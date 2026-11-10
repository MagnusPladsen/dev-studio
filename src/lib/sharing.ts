import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Shared projects (see supabase/migrations/20261110120000_project_sharing.sql). Rows of a shared
 * project stay filed under its owner; members are editors or viewers and join through invite links.
 * This module keeps the signed-in user's memberships in memory and wraps the sharing functions.
 */

export type MemberRole = "editor" | "viewer";
export type ProjectRole = "owner" | MemberRole;
export type SharedProject = { ownerId: string; projectId: string; role: MemberRole; ownerEmail: string };
export type ProjectMember = { userId: string; email: string; role: ProjectRole };
export type ProjectInvite = { token: string; role: MemberRole; expiresAt: string };
export type InvitePreview = {
  ownerId: string;
  projectId: string;
  projectName: string;
  ownerEmail: string;
  role: MemberRole;
  myRole: ProjectRole | null;
};

let shared = new Map<string, SharedProject>();
/** The user's own projects that have members: project id → how many people besides the owner. */
let ownedShares = new Map<string, number>();
const listeners = new Set<() => void>();

const notify = () => {
  for (const listener of listeners) listener();
};

export function getSharedProjects(): Map<string, SharedProject> {
  return shared;
}

/** Replaces the known memberships. Returns the project ids that are new. */
export function setSharedProjects(list: SharedProject[]): string[] {
  const added = list.filter((p) => !shared.has(p.projectId)).map((p) => p.projectId);
  shared = new Map(list.map((p) => [p.projectId, p]));
  notify();
  return added;
}

export function getOwnedShares(): Map<string, number> {
  return ownedShares;
}

export function setOwnedShares(counts: Map<string, number>): void {
  ownedShares = counts;
  notify();
}

export function subscribeShared(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The signed-in user's role in a project they can see: shared ones by membership, every other one is theirs. */
export function roleIn(projectId: string): ProjectRole {
  return shared.get(projectId)?.role ?? "owner";
}

/** Whose account a project's rows are filed under. */
export function ownerOf(projectId: string, userId: string): string {
  return shared.get(projectId)?.ownerId ?? userId;
}

/** The accounts whose rows the user may see: their own and every owner who shared a project with them. */
export function visibleOwners(userId: string): string[] {
  return [...new Set([userId, ...[...shared.values()].map((p) => p.ownerId)])].sort();
}

export function inviteUrl(origin: string, token: string): string {
  return `${origin}/invite/${token}`;
}

async function call<T>(supabase: SupabaseClient, name: string, args?: Record<string, unknown>): Promise<T[]> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message);
  return (data ?? []) as T[];
}

export async function fetchSharedProjects(supabase: SupabaseClient): Promise<SharedProject[]> {
  const rows = await call<{ owner_id: string; project_id: string; role: MemberRole; owner_email: string | null }>(
    supabase,
    "my_shared_projects"
  );
  return rows.map((r) => ({ ownerId: r.owner_id, projectId: r.project_id, role: r.role, ownerEmail: r.owner_email ?? "" }));
}

/** How many members each of the user's own projects has (projects nobody else is in are left out). */
export async function fetchOwnedShares(supabase: SupabaseClient, userId: string): Promise<Map<string, number>> {
  const { data, error } = await supabase.from("project_members").select("project_id").eq("owner_id", userId);
  if (error) throw new Error(error.message);
  const counts = new Map<string, number>();
  for (const row of (data ?? []) as { project_id: string }[]) counts.set(row.project_id, (counts.get(row.project_id) ?? 0) + 1);
  return counts;
}

export async function listMembers(supabase: SupabaseClient, ownerId: string, projectId: string): Promise<ProjectMember[]> {
  const rows = await call<{ user_id: string; email: string | null; role: ProjectRole }>(supabase, "list_project_members", {
    p_owner: ownerId,
    p_project_id: projectId,
  });
  return rows.map((r) => ({ userId: r.user_id, email: r.email ?? "", role: r.role }));
}

export async function listInvites(supabase: SupabaseClient, projectId: string): Promise<ProjectInvite[]> {
  const { data, error } = await supabase
    .from("project_invites")
    .select("token, role, expires_at")
    .eq("project_id", projectId)
    .gt("expires_at", new Date().toISOString())
    .order("created_at");
  if (error) throw new Error(error.message);
  return ((data ?? []) as { token: string; role: MemberRole; expires_at: string }[]).map((r) => ({
    token: r.token,
    role: r.role,
    expiresAt: r.expires_at,
  }));
}

export async function createInvite(supabase: SupabaseClient, projectId: string, role: MemberRole): Promise<ProjectInvite> {
  const [row] = await call<{ token: string; role: MemberRole; expires_at: string }>(supabase, "create_project_invite", {
    p_project_id: projectId,
    p_role: role,
  });
  return { token: row.token, role: row.role, expiresAt: row.expires_at };
}

export async function revokeInvite(supabase: SupabaseClient, token: string): Promise<void> {
  const { error } = await supabase.from("project_invites").delete().eq("token", token);
  if (error) throw new Error(error.message);
}

export async function previewInvite(supabase: SupabaseClient, token: string): Promise<InvitePreview | null> {
  const [row] = await call<{
    owner_id: string;
    project_id: string;
    project_name: string;
    owner_email: string | null;
    role: MemberRole;
    my_role: ProjectRole | null;
  }>(supabase, "preview_project_invite", { p_token: token });
  if (!row) return null;
  return {
    ownerId: row.owner_id,
    projectId: row.project_id,
    projectName: row.project_name,
    ownerEmail: row.owner_email ?? "",
    role: row.role,
    myRole: row.my_role,
  };
}

export async function acceptInvite(supabase: SupabaseClient, token: string): Promise<{ projectId: string; role: ProjectRole }> {
  const [row] = await call<{ project_id: string; role: ProjectRole }>(supabase, "accept_project_invite", { p_token: token });
  return { projectId: row.project_id, role: row.role };
}

export async function setMemberRole(supabase: SupabaseClient, projectId: string, userId: string, role: MemberRole): Promise<void> {
  const { error } = await supabase.from("project_members").update({ role }).eq("project_id", projectId).eq("user_id", userId);
  if (error) throw new Error(error.message);
}

/** The owner removing someone, or a member leaving (userId = their own id). */
export async function removeMember(supabase: SupabaseClient, ownerId: string, projectId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("project_members")
    .delete()
    .eq("owner_id", ownerId)
    .eq("project_id", projectId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}
