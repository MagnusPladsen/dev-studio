/**
 * Sign-in for the local MCP server (`dev-studio-mcp`). The server listens on the first free port of
 * `MCP_LOOPBACK_PORTS`; every one of them is registered as a redirect URI on the Supabase OAuth client,
 * because Supabase matches redirect URIs exactly, port included.
 */
export const MCP_LOOPBACK_PORTS = [53682, 53683, 53684, 53685] as const;

export const MCP_DISPLAY_NAME = "Dev Studio & GameDev Studio";

export const MCP_INSTALL_COMMAND = "claude mcp add --scope user dev-studio -- npx -y dev-studio-mcp";

export const MCP_DESKTOP_CONFIG = JSON.stringify({ mcpServers: { "dev-studio": { command: "npx", args: ["-y", "dev-studio-mcp"] } } }, null, 2);

export const MCP_DOCS_URL = "https://github.com/MagnusPladsen/dev-studio/tree/main/packages/mcp#readme";

/**
 * The `/auth/cli` fallback sign-in, for when Supabase's beta OAuth server can't be used. Off unless the
 * deployment sets `NEXT_PUBLIC_MCP_CLI_AUTH=on`; the MCP server picks it with `STUDIO_AUTH=cli`.
 */
export const isCliAuthEnabled = process.env.NEXT_PUBLIC_MCP_CLI_AUTH === "on";

export function loopbackRedirectUri(port: number): string {
  return `http://127.0.0.1:${port}/callback`;
}

export type SearchParams = Record<string, string | string[] | undefined>;

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

/** One value per key; a key given twice is treated as missing so nobody can smuggle a second value in. */
export function single(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export interface CliAuthRequest {
  port: number;
  state: string;
  codeChallenge: string;
  /** Where Supabase sends the browser back to, with `?code=` added: the MCP server's loopback listener. */
  redirectUri: string;
}

const STATE = /^[A-Za-z0-9_-]{16,128}$/;
/** base64url of a SHA-256 digest is 43 characters; RFC 7636 allows up to 128. */
const CODE_CHALLENGE = /^[A-Za-z0-9_-]{43,128}$/;

/** The MCP server opens `/auth/cli?port=…&state=…&code_challenge=…` and keeps the PKCE verifier to itself. */
export function parseCliAuthParams(params: SearchParams): Parsed<CliAuthRequest> {
  const port = Number(single(params, "port"));
  const state = single(params, "state");
  const codeChallenge = single(params, "code_challenge");
  if (!(MCP_LOOPBACK_PORTS as readonly number[]).includes(port)) return { ok: false, error: "This sign-in link has the wrong port. Start the sign-in again from Claude." };
  if (!state || !STATE.test(state)) return { ok: false, error: "This sign-in link is missing its check value. Start the sign-in again from Claude." };
  if (!codeChallenge || !CODE_CHALLENGE.test(codeChallenge)) return { ok: false, error: "This sign-in link is missing its code challenge. Start the sign-in again from Claude." };
  const redirectUri = `${loopbackRedirectUri(port)}?state=${state}`;
  return { ok: true, value: { port, state, codeChallenge, redirectUri } };
}

/** GitHub sign-in that lands on the MCP server's listener with a PKCE code only its verifier can exchange. */
export function cliGitHubSignInUrl(supabaseUrl: string, request: CliAuthRequest): string {
  const query = new URLSearchParams({
    provider: "github",
    redirect_to: request.redirectUri,
    code_challenge: request.codeChallenge,
    code_challenge_method: "s256",
  });
  return `${supabaseUrl}/auth/v1/authorize?${query}`;
}

/** Emails a magic link whose PKCE code goes to the MCP server. The link only works on this computer. */
export async function requestCliEmailLink(supabaseUrl: string, apiKey: string, email: string, request: CliAuthRequest): Promise<string | null> {
  const response = await fetch(`${supabaseUrl}/auth/v1/otp?redirect_to=${encodeURIComponent(request.redirectUri)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: apiKey },
    body: JSON.stringify({ email, create_user: true, code_challenge: request.codeChallenge, code_challenge_method: "s256" }),
  });
  if (response.ok) return null;
  const body = (await response.json().catch(() => null)) as { msg?: string; message?: string; error_description?: string } | null;
  return body?.msg ?? body?.message ?? body?.error_description ?? "Could not send the sign-in link.";
}
