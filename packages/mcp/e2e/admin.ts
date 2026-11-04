import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { MCP_LOOPBACK_PORTS } from "@/lib/mcp-auth";
import type { E2eEnv } from "./env";

/** Calls to the local stack's admin, auth and data APIs. Service-role calls only ever go to the local stack. */
export interface TestUser {
  id: string;
  email: string;
  password: string;
}

async function json(response: Response): Promise<Record<string, unknown>> {
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) throw new Error(`${response.url} → ${response.status} ${JSON.stringify(body)}`);
  return body;
}

const adminHeaders = (env: E2eEnv) => ({ apikey: env.serviceKey, Authorization: `Bearer ${env.serviceKey}`, "Content-Type": "application/json" });

export async function createUser(env: E2eEnv, label: string): Promise<TestUser> {
  const email = `e2e-${label}-${randomBytes(4).toString("hex")}@example.test`;
  const password = randomBytes(18).toString("base64url");
  const body = await json(
    await fetch(`${env.supabaseUrl}/auth/v1/admin/users`, {
      method: "POST",
      headers: adminHeaders(env),
      body: JSON.stringify({ email, password, email_confirm: true }),
    })
  );
  return { id: String(body.id), email, password };
}

/** A public OAuth client like the production one: PKCE, no secret, the MCP server's loopback redirect URIs. */
export async function registerOAuthClient(env: E2eEnv): Promise<string> {
  const body = await json(
    await fetch(`${env.supabaseUrl}/auth/v1/admin/oauth/clients`, {
      method: "POST",
      headers: adminHeaders(env),
      body: JSON.stringify({
        client_name: "Dev Studio & GameDev Studio (e2e)",
        client_type: "public",
        redirect_uris: MCP_LOOPBACK_PORTS.map((port) => `http://127.0.0.1:${port}/callback`),
      }),
    })
  );
  return String(body.client_id);
}

export async function passwordSession(env: E2eEnv, user: TestUser): Promise<{ accessToken: string; refreshToken: string }> {
  const body = await json(
    await fetch(`${env.supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: env.anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email: user.email, password: user.password }),
    })
  );
  return { accessToken: String(body.access_token), refreshToken: String(body.refresh_token) };
}

/** The authorize step of Supabase's OAuth server: it answers with a redirect to the consent page. Never followed. */
export async function authorizationIdFrom(authorizeUrl: string): Promise<string> {
  const response = await fetch(authorizeUrl, { redirect: "manual" });
  const location = response.headers.get("location") ?? "";
  const id = location ? new URL(location, authorizeUrl).searchParams.get("authorization_id") : null;
  if (response.status !== 302 || !id) throw new Error(`authorize answered ${response.status} ${location || (await response.text()).slice(0, 300)}`);
  return id;
}

export const claimsOf = (token: string): Record<string, unknown> =>
  JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")) as Record<string, unknown>;

/** An HS256 access token for `user` signed with the local stack's JWT secret, carrying an OAuth `client_id` claim. */
export function mintClientToken(env: E2eEnv, user: TestUser, clientId: string): string {
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const head = encode({ alg: "HS256", typ: "JWT" });
  const body = encode({
    iss: `${env.supabaseUrl}/auth/v1`,
    sub: user.id,
    aud: "authenticated",
    role: "authenticated",
    email: user.email,
    client_id: clientId,
    session_id: randomUUID(),
    aal: "aal1",
    iat: now,
    exp: now + 600,
  });
  const signature = createHmac("sha256", env.jwtSecret).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${signature}`;
}

/** PostgREST as one token: the status and the parsed body, never thrown. */
export async function rest(env: E2eEnv, token: string, path: string, init: RequestInit = {}): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${env.supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: env.anonKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: "return=representation", ...init.headers },
  });
  const text = await response.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // keep the text
  }
  return { status: response.status, body };
}

export const asService = (env: E2eEnv, path: string, init?: RequestInit) => rest(env, env.serviceKey, path, init);

/** The newest sign-in link Mailpit caught for `email`. */
export async function magicLinkFor(env: E2eEnv, email: string, timeoutMs = 20_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const search = await json(await fetch(`${env.mailpitUrl}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`));
    const [message] = (search.messages as { ID: string }[] | undefined) ?? [];
    if (message) {
      const full = await json(await fetch(`${env.mailpitUrl}/api/v1/message/${message.ID}`));
      const link = String(full.HTML ?? full.Text ?? "").match(/https?:\/\/[^\s"'<>]+\/auth\/v1\/verify[^\s"'<>]*/)?.[0];
      if (link) return link.replace(/&amp;/g, "&");
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`No sign-in email for ${email} reached Mailpit.`);
}
