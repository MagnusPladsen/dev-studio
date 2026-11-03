import { LOCAL_PREFIX } from "./storage";

/** The part of the Supabase client account deletion needs (so tests can pass a fake). */
export interface AccountClient {
  rpc(name: "delete_own_account"): PromiseLike<{ error: { message: string } | null }>;
  auth: { signOut(options: { scope: "local" }): Promise<unknown> };
}

/**
 * Deletes the signed-in user's projects, assets and login through the `delete_own_account` database function
 * (see supabase/migrations/20261103210000_delete_own_account.sql), then forgets the session in this browser.
 * Returns an error message, or null when the account is gone.
 */
export async function deleteOwnAccount(client: AccountClient): Promise<string | null> {
  const { error } = await client.rpc("delete_own_account");
  if (error) return error.message;
  // the user no longer exists, so only the local session can be cleared
  await client.auth.signOut({ scope: "local" });
  return null;
}

/** Every key this app keeps in the browser: projects (`gds:`) and settings (`gds-`). */
export function isAppStorageKey(key: string): boolean {
  return key.startsWith(LOCAL_PREFIX) || key.startsWith("gds-");
}

/** Removes everything this app stored in this browser. Returns how many keys went. */
export function clearDeviceStorage(store: Storage): number {
  const keys: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i);
    if (key && isAppStorageKey(key)) keys.push(key);
  }
  for (const key of keys) store.removeItem(key);
  return keys.length;
}
