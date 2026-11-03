import type { OAuthAuthorizationDetails, OAuthRedirect, SupabaseClient } from "@supabase/supabase-js";
import { single, type Parsed, type SearchParams } from "@/lib/mcp-auth";

/**
 * The consent page of Supabase's OAuth 2.1 server. Supabase sends people to Site URL + `/oauth/consent`
 * with `?authorization_id=<id>`; the page shows the request and approves or denies it.
 * https://supabase.com/docs/guides/auth/oauth-server/getting-started
 */

const AUTHORIZATION_ID = /^[A-Za-z0-9_-]{1,256}$/;

export function parseConsentParams(params: SearchParams): Parsed<{ authorizationId: string }> {
  const authorizationId = single(params, "authorization_id");
  if (!authorizationId) return { ok: false, error: "This link is missing its sign-in request. Start the sign-in again from Claude." };
  if (!AUTHORIZATION_ID.test(authorizationId)) return { ok: false, error: "This sign-in request isn't valid. Start the sign-in again from Claude." };
  return { ok: true, value: { authorizationId } };
}

export function consentPath(authorizationId: string): string {
  return `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`;
}

export type ConsentPhase =
  | { kind: "checking" }
  | { kind: "signed-out" }
  | { kind: "consent"; details: OAuthAuthorizationDetails }
  | { kind: "redirecting"; url: string }
  | { kind: "error"; message: string };

type AuthClient = Pick<SupabaseClient["auth"], "getSession" | "oauth">;

/** Supabase answers with a redirect URL; only web URLs are followed. */
function redirectPhase(url: string): ConsentPhase {
  try {
    const { protocol } = new URL(url);
    if (protocol === "http:" || protocol === "https:") return { kind: "redirecting", url };
  } catch {
    // fall through
  }
  return { kind: "error", message: "Claude's sign-in sent back an address this page won't open." };
}

/** `getAuthorizationDetails` returns the request to show, or a redirect when the person agreed earlier. */
export function phaseFromDetails(data: OAuthAuthorizationDetails | OAuthRedirect): ConsentPhase {
  return "authorization_id" in data ? { kind: "consent", details: data } : redirectPhase(data.redirect_url);
}

export async function loadConsentPhase(auth: AuthClient, authorizationId: string): Promise<ConsentPhase> {
  const { data: sessionData } = await auth.getSession();
  if (!sessionData.session) return { kind: "signed-out" };
  const { data, error } = await auth.oauth.getAuthorizationDetails(authorizationId);
  if (error || !data) return { kind: "error", message: error?.message ?? "This sign-in request has expired. Start the sign-in again from Claude." };
  return phaseFromDetails(data);
}

export async function decideConsent(auth: AuthClient, authorizationId: string, decision: "approve" | "deny"): Promise<ConsentPhase> {
  const options = { skipBrowserRedirect: true };
  const { data, error } =
    decision === "approve"
      ? await auth.oauth.approveAuthorization(authorizationId, options)
      : await auth.oauth.denyAuthorization(authorizationId, options);
  if (error || !data) return { kind: "error", message: error?.message ?? "Could not finish the sign-in. Start it again from Claude." };
  return redirectPhase(data.redirect_url);
}

/** What the request's scopes show the app, in words. Data access itself comes from row level security. */
export function scopeDescriptions(scope: string): string[] {
  const scopes = new Set(scope.split(/\s+/).filter(Boolean));
  const lines: string[] = [];
  if (scopes.has("email")) lines.push("Your email address");
  if (scopes.has("profile")) lines.push("Your name and avatar, if your account has them");
  if (scopes.has("phone")) lines.push("Your phone number, if your account has one");
  return lines;
}
