import { loopbackRedirectUri } from "@/lib/mcp-auth";
import type { ServerConfig } from "../config";
import type { Pkce } from "./pkce";

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  /** Epoch milliseconds. */
  expiresAt: number;
  userId: string;
  email?: string;
}

export class AuthError extends Error {
  constructor(
    message: string,
    /** The refresh token is dead (revoked, reused, expired): sign in again. */
    readonly isFinal = false
  ) {
    super(message);
  }
}

type Fetch = typeof fetch;

/** Where the browser goes: Supabase's OAuth 2.1 authorize endpoint, or the app's `/auth/cli` fallback page. */
export function signInUrl(config: ServerConfig, pkce: Pkce, port: number): string {
  if (config.authMode === "cli") {
    const query = new URLSearchParams({ port: String(port), state: pkce.state, code_challenge: pkce.challenge });
    return `${config.siteUrl}/auth/cli?${query}`;
  }
  const query = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: loopbackRedirectUri(port),
    code_challenge: pkce.challenge,
    code_challenge_method: "S256",
    state: pkce.state,
    scope: "openid email profile",
  });
  return `${config.supabaseUrl}/auth/v1/oauth/authorize?${query}`;
}

export function jwtClaims(token: string): Record<string, unknown> {
  try {
    return JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function toTokens(body: Record<string, unknown>): Tokens {
  const accessToken = typeof body.access_token === "string" ? body.access_token : "";
  const refreshToken = typeof body.refresh_token === "string" ? body.refresh_token : "";
  if (!accessToken || !refreshToken) throw new AuthError("Supabase sent no tokens back.");
  const claims = jwtClaims(accessToken);
  const expiresIn = typeof body.expires_in === "number" ? body.expires_in : 3600;
  const expiresAt = typeof claims.exp === "number" ? claims.exp * 1000 : Date.now() + expiresIn * 1000;
  return { accessToken, refreshToken, expiresAt, userId: String(claims.sub ?? ""), email: typeof claims.email === "string" ? claims.email : undefined };
}

async function post(fetcher: Fetch, url: string, init: RequestInit): Promise<Tokens> {
  let response: Response;
  try {
    response = await fetcher(url, { ...init, method: "POST" });
  } catch {
    throw new AuthError("Could not reach Supabase. Check the internet connection.");
  }
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (response.ok) return toTokens(body);
  const reason = String(body.error_description ?? body.msg ?? body.error ?? response.status);
  throw new AuthError(`Supabase refused the sign-in (${reason}).`, response.status === 400 || response.status === 401);
}

const form = (fields: Record<string, string>) => ({
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams(fields).toString(),
});

const json = (config: ServerConfig, fields: Record<string, string>) => ({
  headers: { "Content-Type": "application/json", apikey: config.supabaseKey },
  body: JSON.stringify(fields),
});

export function exchangeCode(config: ServerConfig, code: string, pkce: Pkce, port: number, fetcher: Fetch = fetch): Promise<Tokens> {
  if (config.authMode === "cli") {
    return post(fetcher, `${config.supabaseUrl}/auth/v1/token?grant_type=pkce`, json(config, { auth_code: code, code_verifier: pkce.verifier }));
  }
  return post(
    fetcher,
    `${config.supabaseUrl}/auth/v1/oauth/token`,
    form({ grant_type: "authorization_code", code, client_id: config.clientId, redirect_uri: loopbackRedirectUri(port), code_verifier: pkce.verifier })
  );
}

/** Refresh tokens rotate: the one passed in stops working once this succeeds. */
export function refreshTokens(config: ServerConfig, refreshToken: string, fetcher: Fetch = fetch): Promise<Tokens> {
  if (config.authMode === "cli") {
    return post(fetcher, `${config.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, json(config, { refresh_token: refreshToken }));
  }
  return post(
    fetcher,
    `${config.supabaseUrl}/auth/v1/oauth/token`,
    form({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: config.clientId })
  );
}

/** Ends a `/auth/cli` session on the server. OAuth grants have no revoke endpoint; Disconnect in the app does that. */
export async function signOutCliSession(config: ServerConfig, accessToken: string, fetcher: Fetch = fetch): Promise<void> {
  await fetcher(`${config.supabaseUrl}/auth/v1/logout?scope=local`, {
    method: "POST",
    headers: { apikey: config.supabaseKey, Authorization: `Bearer ${accessToken}` },
  }).catch(() => undefined);
}
