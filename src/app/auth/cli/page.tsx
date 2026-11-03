import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthCard, AuthMessage } from "@/components/auth/AuthCard";
import { CliSignIn } from "@/components/auth/CliSignIn";
import { supabaseEnabled } from "@/lib/supabase";
import { isCliAuthEnabled, parseCliAuthParams } from "@/lib/mcp-auth";

export const metadata: Metadata = { title: "Sign Claude in", robots: { index: false, follow: false } };

/** Fallback for the MCP server's sign-in when the OAuth server can't be used. Off unless NEXT_PUBLIC_MCP_CLI_AUTH=on. */
export default function CliAuthPage({ searchParams }: PageProps<"/auth/cli">) {
  return (
    <AuthCard>
      <Suspense fallback={<AuthMessage title="Loading…" />}>
        <CliAuthRequestView searchParams={searchParams} />
      </Suspense>
    </AuthCard>
  );
}

async function CliAuthRequestView({ searchParams }: Pick<PageProps<"/auth/cli">, "searchParams">) {
  if (!isCliAuthEnabled) {
    return <AuthMessage title="This sign-in is turned off">Update dev-studio-mcp and run its sign-in again; it uses the regular Claude sign-in now.</AuthMessage>;
  }
  const parsed = parseCliAuthParams(await searchParams);
  if (!parsed.ok) return <AuthMessage title="Couldn't sign Claude in">{parsed.error}</AuthMessage>;
  if (!supabaseEnabled) return <AuthMessage title="Couldn't sign Claude in">Sign-in is not configured on this server.</AuthMessage>;
  return <CliSignIn request={parsed.value} />;
}
