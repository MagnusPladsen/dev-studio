import { createHash } from "node:crypto";
import { createServer } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readConfig } from "../config";
import { exchangeCode, refreshTokens, signInUrl } from "./oauth";
import { startLoopback, type LoopbackListener } from "./loopback";
import { createPkce } from "./pkce";
import { maskEmail, Session } from "./session";
import type { StoredSession, TokenStore } from "./token-store";

const config = readConfig({});
const cliConfig = readConfig({ STUDIO_AUTH: "cli" });

/** A JWT-shaped token (unsigned: the server only reads its claims). */
function jwt(claims: Record<string, unknown>): string {
  return ["e30", Buffer.from(JSON.stringify(claims)).toString("base64url"), "sig"].join(".");
}

function tokenResponse(refresh: string, exp = Math.floor(Date.now() / 1000) + 3600) {
  return new Response(JSON.stringify({ access_token: jwt({ sub: "user-1", email: "magnus@example.com", exp }), refresh_token: refresh, expires_in: 3600 }), { status: 200 });
}

function memoryStore(initial: StoredSession | null = null): TokenStore & { value: StoredSession | null; log: string[] } {
  const store = {
    value: initial,
    log: [] as string[],
    read: async () => store.value,
    write: async (s: StoredSession) => {
      store.log.push(`write ${s.refreshToken}`);
      store.value = s;
    },
    clear: async () => {
      store.log.push("clear");
      store.value = null;
    },
    describe: () => "memory",
  };
  return store;
}

describe("PKCE and URLs", () => {
  it("makes an S256 challenge from a 64-character verifier", () => {
    const pkce = createPkce();
    expect(pkce.verifier).toMatch(/^[A-Za-z0-9_-]{64}$/);
    expect(pkce.challenge).toBe(createHash("sha256").update(pkce.verifier).digest("base64url"));
    expect(pkce.state).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });

  it("builds the OAuth 2.1 authorize URL for the registered client and loopback port", () => {
    const url = new URL(signInUrl(config, { verifier: "v", challenge: "c", state: "s" }, 53683));
    expect(url.origin + url.pathname).toBe("https://lznqrdbvamheoisjaoqr.supabase.co/auth/v1/oauth/authorize");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: "code",
      client_id: "307f2e96-2f35-4a4e-a116-0d5c4302551f",
      redirect_uri: "http://127.0.0.1:53683/callback",
      code_challenge: "c",
      code_challenge_method: "S256",
      state: "s",
      scope: "openid email profile",
    });
  });

  it("builds the /auth/cli fallback URL on the GameDev Studio site", () => {
    expect(signInUrl(cliConfig, { verifier: "v", challenge: "c", state: "s" }, 53682)).toBe(
      "https://gamedev-studio.pladsen.dev/auth/cli?port=53682&state=s&code_challenge=c"
    );
  });
});

describe("token requests", () => {
  it("exchanges a code at the OAuth token endpoint as a public client", async () => {
    const fetcher = vi.fn(async () => tokenResponse("r1"));
    const tokens = await exchangeCode(config, "the-code", { verifier: "ver", challenge: "c", state: "s" }, 53682, fetcher);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://lznqrdbvamheoisjaoqr.supabase.co/auth/v1/oauth/token");
    expect(Object.fromEntries(new URLSearchParams(String(init.body)))).toEqual({
      grant_type: "authorization_code",
      code: "the-code",
      client_id: config.clientId,
      redirect_uri: "http://127.0.0.1:53682/callback",
      code_verifier: "ver",
    });
    expect(tokens).toMatchObject({ refreshToken: "r1", userId: "user-1", email: "magnus@example.com" });
  });

  it("uses the PKCE grant with the anon key in fallback mode", async () => {
    const fetcher = vi.fn(async () => tokenResponse("r1"));
    await exchangeCode(cliConfig, "code", { verifier: "ver", challenge: "c", state: "s" }, 53682, fetcher);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://lznqrdbvamheoisjaoqr.supabase.co/auth/v1/token?grant_type=pkce");
    expect(JSON.parse(String(init.body))).toEqual({ auth_code: "code", code_verifier: "ver" });
    expect((init.headers as Record<string, string>).apikey).toBe(cliConfig.supabaseKey);
  });

  it("marks a refused refresh as final", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }));
    await expect(refreshTokens(config, "old", fetcher)).rejects.toMatchObject({ isFinal: true, message: expect.stringContaining("invalid_grant") });
  });
});

describe("Session", () => {
  const stored: StoredSession = { refreshToken: "r0", mode: "oauth", userId: "user-1", email: "magnus@example.com" };

  it("refreshes once for concurrent callers and stores the rotated token before using it", async () => {
    const store = memoryStore(stored);
    let resolveFetch: (r: Response) => void = () => {};
    const fetcher = vi.fn(() => new Promise<Response>((resolve) => (resolveFetch = resolve)));
    const session = new Session({ config, store, openBrowser: async () => {}, fetcher });
    const both = Promise.all([session.accessToken(), session.accessToken()]);
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    resolveFetch(tokenResponse("r1"));
    const [a, b] = await both;
    expect(a).toBe(b);
    expect(store.log).toEqual(["write r1"]);
    expect(await session.accessToken()).toBe(a);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("refreshes again when the access token is within five minutes of expiring", async () => {
    const store = memoryStore(stored);
    const soon = Math.floor(Date.now() / 1000) + 120;
    const fetcher = vi.fn().mockResolvedValueOnce(tokenResponse("r1", soon)).mockResolvedValueOnce(tokenResponse("r2"));
    const session = new Session({ config, store, openBrowser: async () => {}, fetcher });
    await session.accessToken();
    await session.accessToken();
    expect(store.log).toEqual(["write r1", "write r2"]);
  });

  it("forgets a revoked sign-in and says how to sign in again", async () => {
    const store = memoryStore(stored);
    const fetcher = vi.fn(async () => new Response("{}", { status: 400 }));
    const session = new Session({ config, store, openBrowser: async () => {}, fetcher });
    await expect(session.accessToken()).rejects.toThrow(/sign_in/);
    expect(store.value).toBeNull();
  });

  it("says not signed in without calling Supabase", async () => {
    const fetcher = vi.fn();
    const session = new Session({ config, store: memoryStore(), openBrowser: async () => {}, fetcher });
    await expect(session.accessToken()).rejects.toThrow(/Not signed in/);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("signs in through the browser and the loopback redirect", async () => {
    const store = memoryStore();
    const fetcher = vi.fn(async () => tokenResponse("r1"));
    const ports = [freePort(), freePort()];
    const session = new Session({
      config: { ...config, ports: await Promise.all(ports) },
      store,
      fetcher,
      openBrowser: async (url) => {
        const query = new URL(url).searchParams;
        const redirect = new URL(query.get("redirect_uri")!);
        redirect.search = new URLSearchParams({ code: "abc", state: query.get("state")! }).toString();
        void fetch(redirect);
      },
    });
    const who = await session.signIn();
    expect(who).toEqual({ userId: "user-1", email: "magnus@example.com", mode: "oauth" });
    expect(store.value?.refreshToken).toBe("r1");
  });

  it("masks the email for display", () => {
    expect(maskEmail("magnus@example.com")).toBe("m•••@example.com");
    expect(maskEmail(undefined)).toBe("(no email)");
  });
});

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const probe = createServer().listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolve(port));
    });
  });
}

describe("loopback listener", () => {
  let listener: LoopbackListener | null = null;
  afterEach(() => listener?.close());

  it("skips a busy port, ignores the wrong state and never echoes the query", async () => {
    const busyPort = await freePort();
    const busy = createServer().listen(busyPort, "127.0.0.1");
    const freeOne = await freePort();
    listener = await startLoopback([busyPort, freeOne], "good-state");
    expect(listener.port).toBe(freeOne);
    const wrong = await fetch(`http://127.0.0.1:${freeOne}/callback?code=x&state=<script>`);
    expect(wrong.status).toBe(404);
    expect(await wrong.text()).not.toContain("<script>");
    const right = await fetch(`http://127.0.0.1:${freeOne}/callback?code=the-code&state=good-state`);
    expect(right.status).toBe(200);
    expect(await listener.result).toEqual({ ok: true, code: "the-code" });
    busy.close();
  });

  it("reports a denied consent", async () => {
    const port = await freePort();
    listener = await startLoopback([port], "s");
    const page = await fetch(`http://127.0.0.1:${port}/callback?error=access_denied&state=s`);
    expect(await page.text()).toContain("You said no");
    expect(await listener.result).toEqual({ ok: false, error: "access_denied" });
  });

  it("gives up after the timeout", async () => {
    listener = await startLoopback([await freePort()], "s", 20);
    expect(await listener.result).toEqual({ ok: false, error: "timeout" });
  });
});
