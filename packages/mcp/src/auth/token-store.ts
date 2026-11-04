import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AuthMode } from "../config";

/** What survives a restart. The access token lives only in memory. */
export interface StoredSession {
  refreshToken: string;
  mode: AuthMode;
  userId: string;
  email?: string;
}

export interface TokenStore {
  read(): Promise<StoredSession | null>;
  write(session: StoredSession): Promise<void>;
  clear(): Promise<void>;
  /** "keychain" or the fallback file's path, for `whoami`. */
  describe(): string;
}

const SERVICE = "dev-studio-mcp";

function parse(text: string | null): StoredSession | null {
  if (!text) return null;
  try {
    const value = JSON.parse(text) as Partial<StoredSession>;
    return value.refreshToken && value.userId ? (value as StoredSession) : null;
  } catch {
    return null;
  }
}

/** The OS keychain (macOS Keychain, Windows Credential Manager, Linux Secret Service), one entry per Supabase project. */
export async function createKeychainStore(account: string): Promise<TokenStore> {
  const { AsyncEntry } = await import("@napi-rs/keyring");
  const entry = new AsyncEntry(SERVICE, account, { linux: { store: "secret-service" } });
  await entry.getPassword();
  return {
    read: async () => parse(await entry.getPassword()),
    write: (session) => entry.setPassword(JSON.stringify(session)),
    clear: async () => {
      await entry.deletePassword();
    },
    describe: () => "keychain",
  };
}

/** Fallback when no keychain works: a file only this user can read. */
export function createFileStore(account: string, directory = join(homedir(), ".config", "studio-mcp")): TokenStore {
  const path = join(directory, `${account.replace(/[^A-Za-z0-9.-]/g, "_")}.json`);
  return {
    read: async () => parse(await readFile(path, "utf8").catch(() => null)),
    async write(session) {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await writeFile(path, JSON.stringify(session), { mode: 0o600 });
    },
    clear: () => rm(path, { force: true }),
    describe: () => path,
  };
}

export async function openTokenStore(supabaseUrl: string, warn: (message: string) => void): Promise<TokenStore> {
  const account = new URL(supabaseUrl).host;
  try {
    return await createKeychainStore(account);
  } catch {
    const store = createFileStore(account);
    warn(`No usable keychain; keeping the sign-in in ${store.describe()} (readable only by you).`);
    return store;
  }
}
