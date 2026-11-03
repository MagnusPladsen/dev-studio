import type { OAuthGrant, SupabaseClient } from "@supabase/supabase-js";

/** Apps the signed-in person has let into their account through Supabase's OAuth server (Claude, for now). */
export type GrantsState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "empty" }
  | { kind: "list"; grants: OAuthGrant[] };

type AuthClient = Pick<SupabaseClient["auth"], "oauth">;

export function grantsStateFrom(result: { data: OAuthGrant[] | null; error: { message: string } | null }): GrantsState {
  if (result.error) return { kind: "error", message: result.error.message };
  const grants = [...(result.data ?? [])].sort((a, b) => b.granted_at.localeCompare(a.granted_at));
  return grants.length ? { kind: "list", grants } : { kind: "empty" };
}

export async function loadGrants(auth: AuthClient): Promise<GrantsState> {
  return grantsStateFrom(await auth.oauth.listGrants());
}

/** Signs the app out everywhere: its sessions and refresh tokens are deleted. Access tokens live out their hour. */
export async function revokeGrant(auth: AuthClient, clientId: string): Promise<string | null> {
  const { error } = await auth.oauth.revokeGrant({ clientId });
  return error?.message ?? null;
}

export function withoutGrant(state: GrantsState, clientId: string): GrantsState {
  if (state.kind !== "list") return state;
  const grants = state.grants.filter((grant) => grant.client.id !== clientId);
  return grants.length ? { kind: "list", grants } : { kind: "empty" };
}

export function formatGrantedAt(isoDate: string, locale?: string): string {
  const date = new Date(isoDate);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date);
}
