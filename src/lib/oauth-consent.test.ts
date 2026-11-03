import { describe, expect, it, vi } from "vitest";
import type { OAuthAuthorizationDetails } from "@supabase/supabase-js";
import { consentPath, decideConsent, loadConsentPhase, parseConsentParams, phaseFromDetails, scopeDescriptions } from "./oauth-consent";

const DETAILS: OAuthAuthorizationDetails = {
  authorization_id: "abc123",
  redirect_uri: "http://127.0.0.1:53682/callback",
  client: { id: "client-1", name: "Dev Studio & GameDev Studio for Claude", uri: "", logo_uri: "" },
  user: { id: "user-1", email: "pip@example.com" },
  scope: "openid email profile",
};

function fakeAuth(overrides: { session?: object | null; details?: unknown; detailsError?: { message: string } | null; decision?: unknown } = {}) {
  const decision = { data: overrides.decision ?? { redirect_url: "http://127.0.0.1:53682/callback?code=c&state=s" }, error: null };
  return {
    getSession: vi.fn(async () => ({ data: { session: overrides.session === undefined ? { user: { id: "user-1" } } : overrides.session }, error: null })),
    oauth: {
      getAuthorizationDetails: vi.fn(async () => ({ data: overrides.details ?? DETAILS, error: overrides.detailsError ?? null })),
      approveAuthorization: vi.fn(async () => decision),
      denyAuthorization: vi.fn(async () => decision),
      listGrants: vi.fn(),
      revokeGrant: vi.fn(),
    },
  } as unknown as Parameters<typeof loadConsentPhase>[0];
}

describe("parseConsentParams", () => {
  it("reads authorization_id", () => {
    expect(parseConsentParams({ authorization_id: "a1b2-c3_d4" })).toEqual({ ok: true, value: { authorizationId: "a1b2-c3_d4" } });
  });

  it.each([
    ["missing", {}],
    ["empty", { authorization_id: "" }],
    ["given twice", { authorization_id: ["a", "b"] }],
    ["with odd characters", { authorization_id: "a/../b" }],
    ["too long", { authorization_id: "a".repeat(257) }],
  ])("rejects an id that is %s", (_label, params) => {
    expect(parseConsentParams(params).ok).toBe(false);
  });
});

describe("consentPath", () => {
  it("brings people back to the same request", () => {
    expect(consentPath("abc123")).toBe("/oauth/consent?authorization_id=abc123");
  });
});

describe("phaseFromDetails", () => {
  it("shows the consent screen for a new request", () => {
    expect(phaseFromDetails(DETAILS)).toEqual({ kind: "consent", details: DETAILS });
  });

  it("redirects straight away when the person agreed before", () => {
    expect(phaseFromDetails({ redirect_url: "http://127.0.0.1:53682/callback?code=x" })).toEqual({ kind: "redirecting", url: "http://127.0.0.1:53682/callback?code=x" });
  });

  it("refuses to follow a non-web redirect", () => {
    expect(phaseFromDetails({ redirect_url: "javascript:alert(1)" }).kind).toBe("error");
  });
});

describe("loadConsentPhase", () => {
  it("asks a signed-out person to sign in without looking the request up", async () => {
    const auth = fakeAuth({ session: null });
    expect(await loadConsentPhase(auth, "abc123")).toEqual({ kind: "signed-out" });
    expect(auth.oauth.getAuthorizationDetails).not.toHaveBeenCalled();
  });

  it("loads the request for a signed-in person", async () => {
    const auth = fakeAuth();
    expect(await loadConsentPhase(auth, "abc123")).toEqual({ kind: "consent", details: DETAILS });
    expect(auth.oauth.getAuthorizationDetails).toHaveBeenCalledWith("abc123");
  });

  it("shows Supabase's error for an expired request", async () => {
    expect(await loadConsentPhase(fakeAuth({ detailsError: { message: "authorization not found" } }), "abc123")).toEqual({ kind: "error", message: "authorization not found" });
  });
});

describe("decideConsent", () => {
  it("approves without auth-js redirecting, so the page can", async () => {
    const auth = fakeAuth();
    expect(await decideConsent(auth, "abc123", "approve")).toEqual({ kind: "redirecting", url: "http://127.0.0.1:53682/callback?code=c&state=s" });
    expect(auth.oauth.approveAuthorization).toHaveBeenCalledWith("abc123", { skipBrowserRedirect: true });
    expect(auth.oauth.denyAuthorization).not.toHaveBeenCalled();
  });

  it("denies", async () => {
    const auth = fakeAuth({ decision: { redirect_url: "http://127.0.0.1:53682/callback?error=access_denied" } });
    expect((await decideConsent(auth, "abc123", "deny")).kind).toBe("redirecting");
    expect(auth.oauth.denyAuthorization).toHaveBeenCalledWith("abc123", { skipBrowserRedirect: true });
  });
});

describe("scopeDescriptions", () => {
  it("names what the scopes share and skips openid", () => {
    expect(scopeDescriptions("openid email profile")).toEqual(["Your email address", "Your name and avatar, if your account has them"]);
    expect(scopeDescriptions("openid")).toEqual([]);
  });
});
