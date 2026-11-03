"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Cloud, CloudOff, FolderOpen, FolderSync, HardDrive, Loader2, LogOut, Mail, AlertTriangle, Check, X } from "lucide-react";
import { useSync } from "./SyncProvider";
import { GithubMark } from "./GithubMark";
import { UseWithClaude } from "./UseWithClaude";

const WELCOME_SEEN_KEY = "gds-signin-welcome-seen";

/** True only the first time a guest opens the studio in this browser; remembers that it asked. */
function shouldWelcomeGuest(): boolean {
  try {
    if (localStorage.getItem(WELCOME_SEEN_KEY)) return false;
    localStorage.setItem(WELCOME_SEEN_KEY, "1");
    return true;
  } catch {
    return false;
  }
}

function SignInDialog({ isWelcome, onClose }: { isWelcome: boolean; onClose(): void }) {
  const { signInWithEmail, signInWithGitHub } = useSync();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setError(null);
    const err = await signInWithEmail(email.trim());
    setBusy(false);
    if (err) setError(err);
    else setSent(true);
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="signin-title"
    >
      <div
        className="w-full max-w-md rounded-2xl p-6 sm:p-7 shadow-2xl"
        style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h2 id="signin-title" className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
            {isWelcome ? "Welcome! Sign in to keep your work" : "Sign in to sync"}
          </h2>
          <button onClick={onClose} style={{ color: "var(--text-muted)" }} aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs mb-4 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          {isWelcome && "Signing in is free and optional. "}
          {isWelcome ? "Your" : "Optional. Your"} projects get saved to your account so you can use them on any device. Anything already in
          this browser is moved into your account the first time you sign in.
        </p>

        {sent ? (
          <div className="text-sm p-3 rounded-lg flex gap-2" style={{ background: "var(--bg-card)", color: "var(--text-primary)" }}>
            <Mail className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "var(--green)" }} />
            <span>
              Check <b>{email}</b> for a sign-in link. You can close this.
            </span>
          </div>
        ) : (
          <>
            <button
              onClick={async () => {
                setError(await signInWithGitHub());
              }}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium mb-3"
              style={{ background: "var(--bg-card)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
            >
              <GithubMark className="w-4 h-4" />
              Continue with GitHub
            </button>
            <div className="flex items-center gap-2 mb-3 text-xs" style={{ color: "var(--text-muted)" }}>
              <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
              or
              <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
            </div>
            <form onSubmit={sendLink} className="space-y-2">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: "var(--bg-primary)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
                autoFocus
              />
              <button
                type="submit"
                disabled={busy}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-60"
                style={{ background: "var(--accent)", color: "white" }}
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                Email me a sign-in link
              </button>
            </form>
          </>
        )}
        {error && (
          <p className="text-xs mt-3" style={{ color: "var(--red)" }}>
            {error}
          </p>
        )}
        {isWelcome && !sent && (
          <button
            onClick={onClose}
            className="w-full mt-3 px-3 py-2 rounded-lg text-sm"
            style={{ color: "var(--text-primary)", border: "1px solid var(--border)" }}
          >
            Continue without an account
          </button>
        )}
      </div>
    </div>
  );
}

export function AccountPanel() {
  const sync = useSync();
  const [dialog, setDialog] = useState<"signin" | "welcome" | null>(null);
  const { status, user, folder } = sync;

  // /projects?signin=1 (the landing page's "Sign in" link) opens the dialog straight away; a guest's first visit
  // gets a welcome version they can skip
  useEffect(() => {
    if (!sync.ready || !sync.cloudAvailable || user) return;
    const url = new URL(window.location.href);
    if (url.searchParams.has("signin")) {
      url.searchParams.delete("signin");
      window.history.replaceState(null, "", url);
      shouldWelcomeGuest();
      setDialog("signin");
    } else if (shouldWelcomeGuest()) {
      setDialog("welcome");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sync.ready]);

  // Signed in and up to date needs no line of its own: the cloud icon on the account row shows it.
  const synced = !!user && status.state !== "saving" && status.state !== "error";
  const statusLine =
    status.state === "saving" ? (
      <div className="flex items-start gap-1.5">
        <Loader2 className="w-3 h-3 shrink-0 mt-0.5 animate-spin" />
        <span className="min-w-0">{status.message || "Saving…"}</span>
      </div>
    ) : status.state === "error" ? (
      <div className="flex items-start gap-1.5" style={{ color: "var(--red)" }} title={status.message}>
        <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
        <span className="min-w-0 line-clamp-3">{status.message || "Could not save"}</span>
      </div>
    ) : user ? null : (
      <div className="flex items-start gap-1.5">
        <HardDrive className="w-3 h-3 shrink-0 mt-0.5" />
        <span className="min-w-0">Saved in this browser</span>
      </div>
    );

  return (
    <div className="space-y-2 text-xs" style={{ color: "var(--text-secondary)" }}>
      {statusLine}

      {sync.cloudAvailable &&
        (user ? (
          <div className="flex items-center gap-2" title={synced ? "Signed in. Everything is synced to your account." : undefined}>
            <span className="relative shrink-0" aria-hidden>
              <Cloud className="w-3.5 h-3.5" style={{ color: "var(--accent)" }} />
              {synced && (
                <Check
                  className="absolute -right-1 -bottom-1 w-2.5 h-2.5 rounded-full p-px"
                  strokeWidth={4}
                  style={{ color: "var(--bg-secondary)", background: "var(--green)" }}
                />
              )}
            </span>
            <span className="truncate flex-1 min-w-0" style={{ color: "var(--text-primary)" }} title={user.email}>
              {user.email ?? "Signed in"}
            </span>
            {synced && <span className="sr-only">Synced to your account</span>}
            <button onClick={() => sync.signOut()} title="Sign out" style={{ color: "var(--text-muted)" }}>
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setDialog("signin")}
            className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg font-medium"
            style={{ background: "var(--accent-glow)", color: "var(--accent)", border: "1px solid color-mix(in srgb, var(--accent) 25%, transparent)" }}
          >
            <CloudOff className="w-3.5 h-3.5" />
            Sign in to sync
          </button>
        ))}

      {sync.cloudAvailable && <UseWithClaude />}

      {sync.folderAvailable &&
        (folder.state === "connected" ? (
          <div className="flex items-center gap-1.5" title="Every change is also written to this folder on your computer">
            <FolderSync className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--green)" }} />
            <span className="truncate flex-1">Folder: {folder.name}</span>
            <button onClick={() => sync.disconnectFolder()} title="Stop syncing to this folder" style={{ color: "var(--text-muted)" }}>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : folder.state === "needs-permission" ? (
          <button
            onClick={() => sync.reconnectFolder()}
            className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg"
            style={{ border: "1px solid var(--yellow)", color: "var(--yellow)" }}
          >
            <FolderOpen className="w-3.5 h-3.5" />
            Reconnect folder “{folder.name}”
          </button>
        ) : (
          <button
            onClick={() => sync.connectFolder()}
            className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg"
            style={{ border: "1px solid var(--border)" }}
            title="Save every project as JSON files in a folder on your computer"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            Save to a local folder
          </button>
        ))}

      <p className="leading-snug pt-1 [@media(max-height:500px)]:hidden" style={{ color: "var(--text-muted)" }}>
        Everything you make is yours: free downloads, no watermark, no attribution needed.
      </p>

      {dialog && createPortal(<SignInDialog isWelcome={dialog === "welcome"} onClose={() => setDialog(null)} />, document.body)}
    </div>
  );
}
