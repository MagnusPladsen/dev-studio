import type { ServerConfig } from "../config";
import { AuthError, exchangeCode, refreshTokens, signInUrl, signOutCliSession, type Tokens } from "./oauth";
import { startLoopback } from "./loopback";
import { createPkce } from "./pkce";
import type { StoredSession, TokenStore } from "./token-store";

export const NOT_SIGNED_IN =
  "Not signed in to Dev Studio / GameDev Studio. Call the `sign_in` tool, or run `npx dev-studio-mcp login` in a terminal.";

/** Refresh this long before the access token expires. */
const REFRESH_MARGIN_MS = 5 * 60_000;

export interface SessionDeps {
  config: ServerConfig;
  store: TokenStore;
  openBrowser: (url: string) => Promise<void>;
  fetcher?: typeof fetch;
  now?: () => number;
}

export interface Identity {
  userId: string;
  email?: string;
  mode: StoredSession["mode"];
}

/**
 * The signed-in user's tokens. Refreshes are single-flight, and the rotated refresh token is stored
 * before the new access token is used: Supabase's reuse detection revokes the whole session if an
 * old refresh token is ever sent again.
 */
export class Session {
  private tokens: Tokens | null = null;
  private refreshing: Promise<Tokens> | null = null;

  constructor(private readonly deps: SessionDeps) {}

  private now() {
    return (this.deps.now ?? Date.now)();
  }

  async identity(): Promise<Identity | null> {
    const stored = await this.deps.store.read();
    return stored ? { userId: stored.userId, email: stored.email, mode: stored.mode } : null;
  }

  async accessToken(): Promise<string> {
    if (this.tokens && this.tokens.expiresAt - REFRESH_MARGIN_MS > this.now()) return this.tokens.accessToken;
    return (await this.refresh()).accessToken;
  }

  /** Forces a refresh (after a 401), sharing one request between concurrent callers. */
  refresh(): Promise<Tokens> {
    this.refreshing ??= this.runRefresh().finally(() => (this.refreshing = null));
    return this.refreshing;
  }

  private async runRefresh(): Promise<Tokens> {
    const stored = await this.deps.store.read();
    if (!stored) throw new AuthError(NOT_SIGNED_IN, true);
    const config = { ...this.deps.config, authMode: stored.mode };
    try {
      const tokens = await refreshTokens(config, stored.refreshToken, this.deps.fetcher);
      await this.remember(tokens, stored.mode);
      return tokens;
    } catch (error) {
      if (error instanceof AuthError && error.isFinal) {
        await this.deps.store.clear();
        this.tokens = null;
        throw new AuthError(`The sign-in has ended (revoked or expired). ${NOT_SIGNED_IN}`, true);
      }
      throw error;
    }
  }

  private async remember(tokens: Tokens, mode: StoredSession["mode"]) {
    await this.deps.store.write({ refreshToken: tokens.refreshToken, mode, userId: tokens.userId, email: tokens.email });
    this.tokens = tokens;
  }

  /** Opens the browser and waits for the loopback redirect. `onUrl` hears the link too, for clients that can show it. */
  async signIn(onUrl: (url: string) => void = () => {}): Promise<Identity> {
    const { config } = this.deps;
    const pkce = createPkce();
    const listener = await startLoopback(config.ports, pkce.state);
    try {
      const url = signInUrl(config, pkce, listener.port);
      onUrl(url);
      await this.deps.openBrowser(url).catch(() => undefined);
      const result = await listener.result;
      if (!result.ok) throw new AuthError(result.error === "access_denied" ? "You said no on the consent page." : `Sign-in did not finish (${result.error}).`);
      const tokens = await exchangeCode(config, result.code, pkce, listener.port, this.deps.fetcher);
      await this.remember(tokens, config.authMode);
      return { userId: tokens.userId, email: tokens.email, mode: config.authMode };
    } finally {
      listener.close();
    }
  }

  async signOut(): Promise<void> {
    const stored = await this.deps.store.read();
    if (stored?.mode === "cli") {
      const token = await this.accessToken().catch(() => null);
      if (token) await signOutCliSession(this.deps.config, token, this.deps.fetcher);
    }
    await this.deps.store.clear();
    this.tokens = null;
  }
}

/** "magnus@example.com" → "m•••@example.com", for `whoami` output. */
export function maskEmail(email: string | undefined): string {
  if (!email) return "(no email)";
  const [name, domain] = email.split("@");
  return domain ? `${name.slice(0, 1)}•••@${domain}` : "•••";
}
