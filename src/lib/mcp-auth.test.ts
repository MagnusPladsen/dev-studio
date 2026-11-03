import { describe, expect, it } from "vitest";
import { cliGitHubSignInUrl, parseCliAuthParams } from "./mcp-auth";
import { isSafeReturnPath } from "./sign-in";

const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
const STATE = "f3b1c2d4e5f6a7b8c9d0";

describe("parseCliAuthParams", () => {
  it("accepts a registered port, a state and an S256 challenge", () => {
    const parsed = parseCliAuthParams({ port: "53683", state: STATE, code_challenge: CHALLENGE });
    expect(parsed).toEqual({ ok: true, value: { port: 53683, state: STATE, codeChallenge: CHALLENGE, redirectUri: `http://127.0.0.1:53683/callback?state=${STATE}` } });
  });

  it.each([
    ["an unregistered port", { port: "8080", state: STATE, code_challenge: CHALLENGE }],
    ["a short state", { port: "53682", state: "abc", code_challenge: CHALLENGE }],
    ["no challenge", { port: "53682", state: STATE }],
    ["a challenge that isn't base64url", { port: "53682", state: STATE, code_challenge: `${CHALLENGE.slice(0, 42)}=` }],
  ])("rejects %s", (_label, params) => {
    expect(parseCliAuthParams(params).ok).toBe(false);
  });

  it("builds a GitHub sign-in that returns the code to the loopback listener", () => {
    const parsed = parseCliAuthParams({ port: "53682", state: STATE, code_challenge: CHALLENGE });
    if (!parsed.ok) throw new Error(parsed.error);
    const url = new URL(cliGitHubSignInUrl("https://project.supabase.co", parsed.value));
    expect(url.origin + url.pathname).toBe("https://project.supabase.co/auth/v1/authorize");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      provider: "github",
      redirect_to: `http://127.0.0.1:53682/callback?state=${STATE}`,
      code_challenge: CHALLENGE,
      code_challenge_method: "s256",
    });
  });
});

describe("isSafeReturnPath", () => {
  it("only allows paths on this site", () => {
    expect(isSafeReturnPath("/oauth/consent?authorization_id=a")).toBe(true);
    expect(isSafeReturnPath("//evil.example")).toBe(false);
    expect(isSafeReturnPath("/\\evil.example")).toBe(false);
    expect(isSafeReturnPath("https://evil.example")).toBe(false);
  });
});
