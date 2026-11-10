"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Users } from "lucide-react";
import { useSync } from "@/components/SyncProvider";
import { SignInDialog } from "@/components/AccountPanel";
import { getSupabase } from "@/lib/supabase";
import { rememberReturnPath } from "@/lib/sign-in";
import { storage } from "@/lib/storage";
import { OTHER_APP, belongsToApp } from "@/lib/app-config";
import { acceptInvite, previewInvite, type InvitePreview } from "@/lib/sharing";

type State = { kind: "loading" } | { kind: "invalid" } | { kind: "error"; message: string } | { kind: "ready"; invite: InvitePreview };

/** The page an invite link opens: who shared what, and a Join button (guests sign in first and come back here). */
export function InviteAccept({ token }: { token: string }) {
  const { ready, user, refreshShared } = useSync();
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [isJoining, setIsJoining] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);

  useEffect(() => {
    const supabase = getSupabase();
    if (!ready || !user || !supabase) return;
    previewInvite(supabase, token)
      .then((invite) => setState(invite ? { kind: "ready", invite } : { kind: "invalid" }))
      .catch((err: Error) => setState({ kind: "error", message: err.message }));
  }, [ready, user, token]);

  function open(projectId: string) {
    const project = storage.getById("projects", projectId);
    if (project && !belongsToApp(project)) window.open(`${OTHER_APP.url}/project/${projectId}/assets`, "_self");
    else router.push(`/project/${projectId}/assets`);
  }

  async function join() {
    setIsJoining(true);
    try {
      const { projectId } = await acceptInvite(getSupabase()!, token);
      await refreshShared();
      open(projectId);
    } catch (err) {
      setState({ kind: "error", message: (err as Error).message });
      setIsJoining(false);
    }
  }

  function signIn() {
    rememberReturnPath(`/invite/${token}`);
    setIsSigningIn(true);
  }

  return (
    <div className="p-6 max-md:p-4 md:p-10 max-w-md mx-auto">
      <div className="rounded-2xl p-6 max-md:p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <Users className="w-8 h-8 mb-3" style={{ color: "var(--accent)" }} />
        {!ready ? (
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--text-muted)" }} />
        ) : !user ? (
          <GuestInvite onSignIn={signIn} />
        ) : (
          <SignedInInvite state={state} isJoining={isJoining} onJoin={join} onOpen={open} />
        )}
      </div>
      {isSigningIn && createPortal(<SignInDialog isWelcome={false} onClose={() => setIsSigningIn(false)} />, document.body)}
    </div>
  );
}

function GuestInvite({ onSignIn }: { onSignIn(): void }) {
  return (
    <>
      <Title>You&apos;re invited to a project</Title>
      <Text>Sign in (free) to see who invited you and join. You&apos;ll come back to this page after signing in.</Text>
      <PrimaryButton onClick={onSignIn}>Sign in to join</PrimaryButton>
    </>
  );
}

function SignedInInvite({ state, isJoining, onJoin, onOpen }: { state: State; isJoining: boolean; onJoin(): void; onOpen(projectId: string): void }) {
  if (state.kind === "loading") return <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--text-muted)" }} />;
  if (state.kind === "invalid" || state.kind === "error") {
    return (
      <>
        <Title>This invite link doesn&apos;t work</Title>
        <Text>{state.kind === "error" ? state.message : "It has expired or was revoked. Ask the person who sent it for a new one."}</Text>
        <Link href="/projects" className="text-sm underline" style={{ color: "var(--text-primary)" }}>
          Go to your projects
        </Link>
      </>
    );
  }
  const { invite } = state;
  if (invite.myRole) {
    return (
      <>
        <Title>You&apos;re already in “{invite.projectName}”</Title>
        <Text>{invite.myRole === "owner" ? "It's your project." : `You're ${invite.myRole === "editor" ? "an editor" : "a viewer"} there.`}</Text>
        <PrimaryButton onClick={() => onOpen(invite.projectId)}>Open project</PrimaryButton>
      </>
    );
  }
  return (
    <>
      <Title>Join “{invite.projectName}”</Title>
      <Text>
        {invite.ownerEmail || "Someone"} invited you as {invite.role === "editor" ? "an editor: you can change everything and delete assets" : "a viewer: you can look and export"}.
        The other people in the project will see your email address.
      </Text>
      <PrimaryButton onClick={onJoin} isBusy={isJoining}>
        Join project
      </PrimaryButton>
    </>
  );
}

function Title({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="text-lg font-semibold mb-2 break-words" style={{ color: "var(--text-primary)" }}>
      {children}
    </h1>
  );
}

function Text({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-sm mb-4 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
      {children}
    </p>
  );
}

function PrimaryButton({ onClick, isBusy, children }: { onClick(): void; isBusy?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={isBusy}
      className="flex items-center justify-center gap-1.5 w-full px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-60"
      style={{ background: "var(--accent)", color: "var(--on-accent, white)" }}
    >
      {isBusy && <Loader2 className="w-4 h-4 animate-spin" />}
      {children}
    </button>
  );
}
