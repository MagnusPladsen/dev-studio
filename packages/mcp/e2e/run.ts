import { randomBytes } from "node:crypto";
import { chromium } from "playwright";
import { claimsOf, createUser, mintClientToken, registerOAuthClient } from "./admin";
import { checkInApp } from "./browser";
import { check, section, summary } from "./check";
import { readEnv } from "./env";
import { checkClientTokenCannotDelete, checkOtherUser } from "./rls";
import { forgetStoredSession, oauthAccessToken, seedPasswordSession, signInWithOAuth, type AuthPath } from "./sign-in";
import { runTools, signOutTool } from "./tools";

/** Driven by scripts/mcp-e2e.sh, which starts the local stack and the app. Prints one line per check. */
async function main(): Promise<number> {
  const env = readEnv();
  const marker = `zebra${randomBytes(3).toString("hex")}`;
  section(`Local stack ${env.supabaseUrl}, app ${env.appUrl}, marker ${marker}`);
  const userA = await createUser(env, "a");
  const userB = await createUser(env, "b");
  const clientId = await registerOAuthClient(env);
  console.log(`  users A and B created, OAuth client ${clientId} registered`);

  const browser = await chromium.launch();
  const signedIn = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  let authPath: AuthPath = "oauth";
  try {
    section("Sign-in");
    try {
      const said = await signInWithOAuth(env, await signedIn.newPage(), userA, clientId);
      check("dev-studio-mcp login: OAuth 2.1 PKCE through the consent page", said.includes("Signed in"), said);
    } catch (error) {
      authPath = "password";
      console.log(`  OAuth sign-in did not work (${error instanceof Error ? error.message : error}); using a password-grant session instead.`);
      await seedPasswordSession(env, userA);
    }

    const created = await runTools(env, clientId, marker);
    await checkInApp(env, browser, signedIn, created);
    await checkOtherUser(env, userA, userB, created);

    const tokens = [{ label: "minted client_id JWT", token: mintClientToken(env, userA, clientId) }];
    if (authPath === "oauth") {
      const real = await oauthAccessToken(env, userA, clientId);
      check("Supabase's own OAuth token carries client_id", claimsOf(real).client_id === clientId, claimsOf(real));
      tokens.unshift({ label: "OAuth access token", token: real });
    }
    await checkClientTokenCannotDelete(env, userA, created, tokens);

    section("Sign-out");
    await signOutTool(env, clientId);
  } finally {
    await forgetStoredSession(env);
    await browser.close();
  }
  console.log(`\nAuth path: ${authPath === "oauth" ? "OAuth 2.1 PKCE (dev-studio-mcp login + consent page)" : "password-grant fallback"}.`);
  return summary();
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error instanceof Error ? error.stack : error);
    summary();
    process.exit(1);
  }
);
