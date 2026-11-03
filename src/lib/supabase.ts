import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/** Cloud sync is optional: without these env vars the app runs fully local. */
export const supabaseEnabled = Boolean(url && key && url.startsWith("http"));

/** The public project URL and publishable key, for the few calls that skip supabase-js (the MCP fallback sign-in). */
export const supabaseProject = supabaseEnabled ? { url: url!, key: key! } : null;

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!supabaseEnabled || typeof window === "undefined") return null;
  client ??= createBrowserClient(url!, key!);
  return client;
}
