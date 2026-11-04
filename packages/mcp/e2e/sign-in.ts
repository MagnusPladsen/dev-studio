import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { delimiter } from "node:path";
import type { Page } from "playwright";
import { authorizationIdFrom, magicLinkFor, passwordSession, type TestUser } from "./admin";
import { openedUrlFile, serverEnv, shimDir, type E2eEnv } from "./env";
import { openTokenStore } from "../src/auth/token-store";

export type AuthPath = "oauth" | "password";

/**
 * `open` / `xdg-open` stand-ins put first on PATH for `dev-studio-mcp login`: they write down the URL the
 * server wanted to open, so the check can carry on in Playwright instead of the system browser.
 */
async function writeOpenShims(env: E2eEnv) {
  await mkdir(shimDir(env), { recursive: true });
  const script = `#!/bin/sh\nfor arg in "$@"; do last="$arg"; done\nprintf '%s' "$last" > "${openedUrlFile(env)}"\n`;
  for (const name of ["open", "xdg-open"]) {
    const path = `${shimDir(env)}/${name}`;
    await writeFile(path, script);
    await chmod(path, 0o755);
  }
}

async function waitForFile(path: string, timeoutMs: number): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const text = await readFile(path, "utf8").catch(() => "");
    if (text) return text.trim();
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Nothing was written to ${path}.`);
}

/** The app's own sign-in: a magic link by email (caught by Mailpit), opened in the same browser. */
export async function signInToApp(env: E2eEnv, page: Page, user: TestUser) {
  // The analytics banner has an "Allow" button of its own; decline it so it never answers the consent question.
  await page.getByRole("button", { name: "No thanks" }).click({ timeout: 5_000 }).catch(() => undefined);
  await page.getByRole("textbox", { name: "Email address" }).fill(user.email);
  await page.getByRole("button", { name: /email|link|sign in/i }).last().click();
  await page.goto(await magicLinkFor(env, user.email));
}

/**
 * The real sign-in, as a user does it: `dev-studio-mcp login` starts PKCE against the local OAuth 2.1 server,
 * the consent page of the locally built app signs the user in by magic link, the user presses Allow, and
 * the server's loopback listener exchanges the code and stores the refresh token.
 */
export async function signInWithOAuth(env: E2eEnv, page: Page, user: TestUser, clientId: string): Promise<string> {
  await writeOpenShims(env);
  const login = spawn(process.execPath, [env.serverEntry, "login"], {
    env: serverEnv(env, clientId, { PATH: `${shimDir(env)}${delimiter}${process.env.PATH ?? ""}` }) as NodeJS.ProcessEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  login.stdout.on("data", (chunk) => (output += chunk));
  login.stderr.on("data", (chunk) => (output += chunk));
  const exited = new Promise<number>((resolve) => login.once("exit", (code) => resolve(code ?? 1)));
  try {
    const authorizeUrl = await waitForFile(openedUrlFile(env), 15_000);
    if (!authorizeUrl.startsWith(`${env.supabaseUrl}/auth/v1/oauth/authorize?`)) throw new Error(`login opened ${authorizeUrl}`);
    const authorizationId = await authorizationIdFrom(authorizeUrl);
    await page.goto(`${env.appUrl}/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`);
    await signInToApp(env, page, user);
    await page.getByRole("button", { name: "Allow", exact: true }).click({ timeout: 30_000 });
    const code = await Promise.race([exited, new Promise<number>((resolve) => setTimeout(() => resolve(-1), 30_000))]);
    if (code !== 0) throw new Error(`login exited with ${code}: ${output}`);
    return output.trim();
  } catch (error) {
    const shown = await page.locator("body").innerText().catch(() => "");
    throw new Error(`${error instanceof Error ? error.message : error}\n  page ${page.url()}: ${shown.slice(0, 400)}`);
  } finally {
    login.kill();
  }
}

/** Fallback when the stack has no OAuth server: a password-grant session, stored where the server looks for it. */
export async function seedPasswordSession(env: E2eEnv, user: TestUser) {
  const { refreshToken } = await passwordSession(env, user);
  const store = await openTokenStore(env.supabaseUrl, () => undefined);
  await store.write({ refreshToken, mode: "cli", userId: user.id, email: user.email });
}

export async function forgetStoredSession(env: E2eEnv) {
  const store = await openTokenStore(env.supabaseUrl, () => undefined);
  await store.clear().catch(() => undefined);
}

const b64url = (bytes: Buffer) => bytes.toString("base64url");

/**
 * A second OAuth access token for the same user, without a browser: authorize, approve through the Auth API
 * the consent page uses, and exchange the code. Its `client_id` claim is set by Supabase itself.
 */
export async function oauthAccessToken(env: E2eEnv, user: TestUser, clientId: string): Promise<string> {
  const verifier = b64url(randomBytes(48));
  const redirectUri = "http://127.0.0.1:53685/callback";
  const query = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge: b64url(createHash("sha256").update(verifier).digest()),
    code_challenge_method: "S256",
    state: b64url(randomBytes(16)),
    scope: "openid email",
  });
  const authorizationId = await authorizationIdFrom(`${env.supabaseUrl}/auth/v1/oauth/authorize?${query}`);
  const { accessToken } = await passwordSession(env, user);
  const headers = { apikey: env.anonKey, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };
  const authorization = `${env.supabaseUrl}/auth/v1/oauth/authorizations/${authorizationId}`;
  // Reading the request first ties it to the user, as the consent page does; an earlier consent answers with the redirect.
  const details = await fetch(authorization, { headers });
  let consentBody = (await details.json().catch(() => ({}))) as { redirect_url?: string };
  let consent = details;
  if (!consentBody.redirect_url) {
    consent = await fetch(`${authorization}/consent`, { method: "POST", headers, body: JSON.stringify({ action: "approve" }) });
    consentBody = (await consent.json().catch(() => ({}))) as { redirect_url?: string };
  }
  const code = consentBody.redirect_url ? new URL(consentBody.redirect_url).searchParams.get("code") : null;
  if (!code) throw new Error(`consent answered ${consent.status} ${JSON.stringify(consentBody)}`);
  const token = await fetch(`${env.supabaseUrl}/auth/v1/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, client_id: clientId, redirect_uri: redirectUri, code_verifier: verifier }),
  });
  const tokenBody = (await token.json().catch(() => ({}))) as { access_token?: string };
  if (!tokenBody.access_token) throw new Error(`token answered ${token.status} ${JSON.stringify(tokenBody)}`);
  return tokenBody.access_token;
}
