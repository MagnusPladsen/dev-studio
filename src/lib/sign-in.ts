import { getSupabase } from "@/lib/supabase";

const RETURN_PATH_KEY = "gds-auth-return-to";

const NOT_CONFIGURED = "Cloud sync is not configured on this server.";

/** Only paths on this site, so a stored value can never send someone to another domain. */
export function isSafeReturnPath(path: string): boolean {
  return path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\");
}

/**
 * Where `/auth/callback` goes after sign-in, for pages that sign people in and want them back (the OAuth
 * consent page). Kept in localStorage because email links open in a new tab.
 */
export function rememberReturnPath(path: string): void {
  try {
    if (isSafeReturnPath(path)) localStorage.setItem(RETURN_PATH_KEY, path);
  } catch {
    // Storage blocked: sign-in still works, it just lands on the projects list.
  }
}

/** Reads and forgets the remembered path. */
export function takeReturnPath(): string | null {
  try {
    const path = localStorage.getItem(RETURN_PATH_KEY);
    localStorage.removeItem(RETURN_PATH_KEY);
    return path && isSafeReturnPath(path) ? path : null;
  } catch {
    return null;
  }
}

export async function signInWithEmail(email: string): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return NOT_CONFIGURED;
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
  });
  return error?.message ?? null;
}

export async function signInWithGitHub(): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return NOT_CONFIGURED;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "github",
    options: { redirectTo: `${window.location.origin}/auth/callback` },
  });
  return error?.message ?? null;
}
