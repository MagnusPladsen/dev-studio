import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthCard, AuthMessage } from "@/components/auth/AuthCard";
import { OAuthConsent } from "@/components/auth/OAuthConsent";
import { supabaseEnabled } from "@/lib/supabase";
import { parseConsentParams } from "@/lib/oauth-consent";

export const metadata: Metadata = { title: "Connect Claude", robots: { index: false, follow: false } };

/**
 * Supabase's OAuth server sends people here (Site URL + `authorization_path`) when the MCP server signs in.
 * Site URL is the GameDev Studio domain, but the page renders in either app's build.
 */
export default function OAuthConsentPage({ searchParams }: PageProps<"/oauth/consent">) {
  return (
    <AuthCard>
      <Suspense fallback={<AuthMessage title="Checking your sign-in…" />}>
        <ConsentRequest searchParams={searchParams} />
      </Suspense>
    </AuthCard>
  );
}

async function ConsentRequest({ searchParams }: Pick<PageProps<"/oauth/consent">, "searchParams">) {
  const parsed = parseConsentParams(await searchParams);
  if (!parsed.ok) return <AuthMessage title="Couldn't connect Claude">{parsed.error}</AuthMessage>;
  if (!supabaseEnabled) return <AuthMessage title="Couldn't connect Claude">Sign-in is not configured on this server.</AuthMessage>;
  return <OAuthConsent authorizationId={parsed.value.authorizationId} />;
}
