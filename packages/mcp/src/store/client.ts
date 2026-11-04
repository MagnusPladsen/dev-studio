import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ServerConfig } from "../config";
import type { Session } from "../auth/session";

/**
 * A supabase-js client that signs every request with the session's access token. A 401 (token expired
 * or revoked early) refreshes once and repeats the request with the new token.
 */
export function createStudioClient(config: ServerConfig, session: Session): SupabaseClient {
  const retryingFetch: typeof fetch = async (input, init) => {
    const response = await fetch(input, init);
    if (response.status !== 401) return response;
    const { accessToken } = await session.refresh();
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${accessToken}`);
    return fetch(input, { ...init, headers });
  };
  return createClient(config.supabaseUrl, config.supabaseKey, {
    // Studio checks the sign-in before every call; here a missing one must not throw, because
    // supabase-js also asks for a token once at startup (for Realtime, which the server never uses).
    accessToken: () => session.accessToken().catch(() => null),
    global: { fetch: retryingFetch },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
