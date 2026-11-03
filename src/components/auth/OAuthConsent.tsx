"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import { MCP_DISPLAY_NAME } from "@/lib/mcp-auth";
import { consentPath, decideConsent, loadConsentPhase, scopeDescriptions, type ConsentPhase } from "@/lib/oauth-consent";
import { rememberReturnPath, signInWithEmail, signInWithGitHub } from "@/lib/sign-in";
import { AuthMessage } from "./AuthCard";
import { SignInForm } from "./SignInForm";

const CAN = ["Read and edit your projects in GameDev Studio and Dev Studio", "Rename, tag and link your art and audio"];
const CANNOT = ["Delete projects or anything in them", "Change the pixels, tiles or sounds of your art and audio"];

/** Allow / Deny for an OAuth sign-in request, after signing in if needed. */
export function OAuthConsent({ authorizationId }: { authorizationId: string }) {
  const [phase, setPhase] = useState<ConsentPhase>({ kind: "checking" });
  const [isDeciding, setIsDeciding] = useState(false);

  // INITIAL_SESSION fires on subscribe; SIGNED_IN also arrives from an email link opened in another tab.
  // Supabase calls are deferred out of the callback, as auth-js asks.
  useEffect(() => {
    const auth = getSupabase()?.auth;
    if (!auth) return;
    const { data } = auth.onAuthStateChange((event) => {
      if (event === "INITIAL_SESSION" || event === "SIGNED_IN") setTimeout(() => void loadConsentPhase(auth, authorizationId).then(setPhase), 0);
      else if (event === "SIGNED_OUT") setPhase({ kind: "signed-out" });
    });
    return () => data.subscription.unsubscribe();
  }, [authorizationId]);

  useEffect(() => {
    if (phase.kind === "redirecting") window.location.assign(phase.url);
  }, [phase]);

  async function decide(decision: "approve" | "deny") {
    const auth = getSupabase()?.auth;
    if (!auth) return;
    setIsDeciding(true);
    setPhase(await decideConsent(auth, authorizationId, decision));
    setIsDeciding(false);
  }

  if (phase.kind === "checking") return <AuthMessage title="Checking your sign-in…" />;
  if (phase.kind === "redirecting") return <AuthMessage title="Taking you back to Claude…">You can close this tab once Claude says you&apos;re signed in.</AuthMessage>;
  if (phase.kind === "error") return <AuthMessage title="Couldn't connect Claude">{phase.message}</AuthMessage>;

  if (phase.kind === "signed-out") {
    return (
      <div>
        <h1 className="text-lg font-semibold text-center mb-1" style={{ color: "var(--text-primary)" }}>
          Sign in to connect Claude
        </h1>
        <p className="text-xs text-center mb-5 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          {MCP_DISPLAY_NAME} for Claude wants to use your account. Sign in first, then choose whether to allow it.
        </p>
        <SignInForm
          onGitHub={() => {
            rememberReturnPath(consentPath(authorizationId));
            return signInWithGitHub();
          }}
          onEmail={(email) => {
            rememberReturnPath(consentPath(authorizationId));
            return signInWithEmail(email);
          }}
          sentNote="Open it in this browser and this page carries on."
        />
      </div>
    );
  }

  const { details } = phase;
  const shared = scopeDescriptions(details.scope);
  return (
    <div>
      <h1 className="text-lg font-semibold text-center mb-1 break-words" style={{ color: "var(--text-primary)" }}>
        {details.client.name || `${MCP_DISPLAY_NAME} for Claude`} wants to use your account
      </h1>
      <p className="text-xs text-center mb-5" style={{ color: "var(--text-secondary)" }}>
        Signed in as <b className="break-all" style={{ color: "var(--text-primary)" }}>{details.user.email}</b>
        {" · "}
        <button className="underline" style={{ color: "var(--text-primary)" }} onClick={() => void getSupabase()?.auth.signOut()}>
          Not you?
        </button>
      </p>

      <PermissionList title="It can:" lines={CAN} icon={<Check className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "var(--green)" }} aria-hidden />} />
      <PermissionList title="It can't:" lines={CANNOT} icon={<X className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "var(--red)" }} aria-hidden />} />
      {shared.length > 0 && (
        <>
          <p className="text-xs font-medium mb-2" style={{ color: "var(--text-primary)" }}>
            It will see:
          </p>
          <ul className="space-y-1 mb-4 text-sm list-disc pl-5" style={{ color: "var(--text-secondary)" }}>
            {shared.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </>
      )}
      <p className="text-xs mb-5 leading-relaxed" style={{ color: "var(--text-muted)" }}>
        It runs on your computer and talks to your account directly. You can disconnect it any time under Use with Claude in the
        studio&apos;s sidebar. Sends you back to <span className="break-all">{details.redirect_uri}</span>.
      </p>

      <div className="flex gap-2 max-md:flex-col-reverse">
        <button
          onClick={() => void decide("deny")}
          disabled={isDeciding}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm disabled:opacity-60"
          style={{ color: "var(--text-primary)", border: "1px solid var(--border)" }}
        >
          <X className="w-4 h-4" />
          Deny
        </button>
        <button
          onClick={() => void decide("approve")}
          disabled={isDeciding}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-60"
          style={{ background: "var(--accent)", color: "white" }}
        >
          {isDeciding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          Allow
        </button>
      </div>
    </div>
  );
}

function PermissionList({ title, lines, icon }: { title: string; lines: string[]; icon: React.ReactNode }) {
  return (
    <>
      <p className="text-xs font-medium mb-2" style={{ color: "var(--text-primary)" }}>
        {title}
      </p>
      <ul className="space-y-1.5 mb-4 text-sm" style={{ color: "var(--text-secondary)" }}>
        {lines.map((line) => (
          <li key={line} className="flex gap-2">
            {icon}
            {line}
          </li>
        ))}
      </ul>
    </>
  );
}
