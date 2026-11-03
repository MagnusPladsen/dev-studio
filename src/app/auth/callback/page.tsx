"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabase } from "@/lib/supabase";
import { APP } from "@/lib/app-config";
import { takeReturnPath } from "@/lib/sign-in";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const providerError = params.get("error_description") ?? hash.get("error_description");
    if (providerError) {
      setError(providerError);
      return;
    }
    const supabase = getSupabase();
    if (!supabase) {
      setError("Sign-in is not configured on this server.");
      return;
    }
    (async () => {
      // The browser client exchanges the ?code= from the email/OAuth redirect on startup;
      // getSession waits for that to finish.
      let { data } = await supabase.auth.getSession();
      const code = params.get("code");
      if (!data.session && code) {
        const exchanged = await supabase.auth.exchangeCodeForSession(code);
        if (exchanged.error) {
          setError(exchanged.error.message);
          return;
        }
        data = { session: exchanged.data.session };
      }
      if (!data.session) {
        setError("That sign-in link has expired or was already used. Request a new one.");
        return;
      }
      router.replace(takeReturnPath() ?? "/projects");
    })();
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "var(--bg-primary)" }}>
      <div className="text-center max-w-sm">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm mx-auto mb-4" style={{ background: "var(--accent)" }}>
          {APP.initials}
        </div>
        {error ? (
          <>
            <p className="font-medium mb-2" style={{ color: "var(--text-primary)" }}>
              Sign-in didn&apos;t work
            </p>
            <p className="text-sm mb-5" style={{ color: "var(--text-secondary)" }}>
              {error}
            </p>
            <Link href="/projects" className="text-sm px-4 py-2 rounded-lg" style={{ background: "var(--accent)", color: "white" }}>
              Back to the studio
            </Link>
          </>
        ) : (
          <p style={{ color: "var(--text-secondary)" }}>Signing you in…</p>
        )}
      </div>
    </div>
  );
}
