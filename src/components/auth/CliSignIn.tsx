"use client";

import { cliGitHubSignInUrl, requestCliEmailLink, MCP_DISPLAY_NAME, type CliAuthRequest } from "@/lib/mcp-auth";
import { supabaseProject } from "@/lib/supabase";
import { SignInForm } from "./SignInForm";

/**
 * Fallback sign-in for the MCP server. The sign-in's PKCE code goes straight to the server's loopback
 * listener, which alone holds the verifier, so Claude gets a session of its own and this browser's
 * session is never copied.
 */
export function CliSignIn({ request }: { request: CliAuthRequest }) {
  const project = supabaseProject;
  if (!project) return null;
  return (
    <div>
      <h1 className="text-lg font-semibold text-center mb-1" style={{ color: "var(--text-primary)" }}>
        Sign Claude in to your account
      </h1>
      <p className="text-xs text-center mb-5 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
        {MCP_DISPLAY_NAME} for Claude gets its own sign-in. It can read and edit your projects, not delete them. This
        browser stays as it is.
      </p>
      <SignInForm
        onGitHub={async () => {
          window.location.assign(cliGitHubSignInUrl(project.url, request));
          return null;
        }}
        onEmail={(email) => requestCliEmailLink(project.url, project.key, email, request)}
        sentNote="Open the link on this computer, where Claude is running."
      />
    </div>
  );
}
