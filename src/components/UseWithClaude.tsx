"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Bot, Check, Copy, ExternalLink, Loader2, RefreshCw, X } from "lucide-react";
import { useSync } from "./SyncProvider";
import { getSupabase } from "@/lib/supabase";
import { MCP_DESKTOP_CONFIG, MCP_DOCS_URL, MCP_INSTALL_COMMAND } from "@/lib/mcp-auth";
import { formatGrantedAt, loadGrants, revokeGrant, withoutGrant, type GrantsState } from "@/lib/oauth-grants";
import { COPY } from "@/copy";

/** Account panel row: opens setup steps for the local MCP server and the list of connected apps. Signed-in only. */
export function UseWithClaude() {
  const { user } = useSync();
  const [isOpen, setIsOpen] = useState(false);

  if (!user) {
    return (
      <p className="flex items-start gap-1.5 leading-snug" style={{ color: "var(--text-muted)" }}>
        <Bot className="w-3.5 h-3.5 shrink-0" aria-hidden />
        <span className="min-w-0">Using your projects with Claude needs a free account.</span>
      </p>
    );
  }

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg"
        style={{ border: "1px solid var(--border)", color: "var(--text-primary)" }}
        title="Connect Claude Desktop or Claude Code to your projects"
      >
        <Bot className="w-3.5 h-3.5" />
        Use with Claude
      </button>
      {isOpen && createPortal(<UseWithClaudeDialog onClose={() => setIsOpen(false)} />, document.body)}
    </>
  );
}

function UseWithClaudeDialog({ onClose }: { onClose(): void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="use-with-claude-title"
    >
      <div
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl p-6 sm:p-7 max-md:p-5 shadow-2xl text-sm"
        style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h2 id="use-with-claude-title" className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
            Use with Claude
          </h2>
          <button onClick={onClose} style={{ color: "var(--text-muted)" }} title="Close" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs mb-5 leading-relaxed">
          {COPY.claude.pitch} It runs on your computer and talks to your account directly. Free, like everything here.
        </p>

        <SetupStep title="Claude Code" hint="Run this in a terminal:" text={MCP_INSTALL_COMMAND} copyLabel="Copy the Claude Code command" />
        <SetupStep
          title="Claude Desktop"
          hint="Settings → Developer → Edit Config, add this to claude_desktop_config.json and restart Claude:"
          text={MCP_DESKTOP_CONFIG}
          copyLabel="Copy the Claude Desktop config"
        />
        <p className="text-xs mb-5 leading-relaxed">
          The first time Claude uses it, your browser opens so you can sign in and allow it.{" "}
          <a href={MCP_DOCS_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline" style={{ color: "var(--text-primary)" }}>
            Setup guide
            <ExternalLink className="w-3 h-3" aria-hidden />
          </a>
        </p>

        <ConnectedApps />
      </div>
    </div>
  );
}

function SetupStep({ title, hint, text, copyLabel }: { title: string; hint: string; text: string; copyLabel: string }) {
  const [isCopied, setIsCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 1500);
    } catch {
      // Clipboard blocked: the text is selectable.
    }
  }

  return (
    <section className="mb-4">
      <h3 className="text-xs font-medium mb-1" style={{ color: "var(--text-primary)" }}>
        {title}
      </h3>
      <p className="text-xs mb-1.5">{hint}</p>
      <div className="flex items-start gap-2 rounded-lg p-2" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}>
        <pre className="flex-1 min-w-0 overflow-x-auto text-xs font-mono py-0.5 select-all" style={{ color: "var(--text-primary)" }}>
          {text}
        </pre>
        <button onClick={() => void copy()} className="shrink-0 p-1 rounded" style={{ color: "var(--text-muted)" }} title={copyLabel} aria-label={copyLabel}>
          {isCopied ? <Check className="w-3.5 h-3.5" style={{ color: "var(--green)" }} /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>
    </section>
  );
}

function SessionEnded() {
  const sync = useSync();
  return (
    <div className="flex items-center gap-2 text-xs" role="alert">
      <span className="min-w-0" style={{ color: "var(--red)" }}>
        Your sign-in has ended. Sign out, then sign in again to see connected apps.
      </span>
      <button
        onClick={() => void sync.signOut()}
        className="shrink-0 px-2 py-1 rounded-lg"
        style={{ color: "var(--text-primary)", border: "1px solid var(--border)" }}
      >
        Sign out
      </button>
    </div>
  );
}

function ConnectedApps() {
  const [state, setState] = useState<GrantsState>({ kind: "loading" });
  const [revoking, setRevoking] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  async function reload() {
    const auth = getSupabase()?.auth;
    if (!auth) return;
    setState({ kind: "loading" });
    setState(await loadGrants(auth));
  }

  useEffect(() => {
    const auth = getSupabase()?.auth;
    if (auth) void loadGrants(auth).then(setState);
  }, []);

  async function disconnect(clientId: string) {
    const auth = getSupabase()?.auth;
    if (!auth) return;
    setRevoking(clientId);
    setRevokeError(null);
    const message = await revokeGrant(auth, clientId);
    setRevoking(null);
    if (message) setRevokeError(message);
    else setState((current) => withoutGrant(current, clientId));
  }

  return (
    <section>
      <h3 className="text-xs font-medium mb-2" style={{ color: "var(--text-primary)" }}>
        Connected apps
      </h3>
      {state.kind === "loading" && (
        <p className="flex items-center gap-1.5 text-xs" role="status">
          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
          Loading…
        </p>
      )}
      {state.kind === "empty" && <p className="text-xs">Claude isn&apos;t connected.</p>}
      {state.kind === "error" && (
        <p className="flex items-center gap-2 text-xs" style={{ color: "var(--red)" }} role="alert">
          <span className="min-w-0">Couldn&apos;t load connected apps: {state.message}</span>
          <button onClick={() => void reload()} className="shrink-0" style={{ color: "var(--text-primary)" }} title="Try again" aria-label="Try again">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </p>
      )}
      {state.kind === "session-ended" && <SessionEnded />}
      {state.kind === "list" && (
        <ul className="space-y-2">
          {state.grants.map((grant) => (
            <li key={grant.client.id} className="flex items-center gap-2 rounded-lg p-2" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate" style={{ color: "var(--text-primary)" }} title={grant.client.name}>
                  {grant.client.name}
                </p>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Connected {formatGrantedAt(grant.granted_at)}
                </p>
              </div>
              <button
                onClick={() => void disconnect(grant.client.id)}
                disabled={revoking === grant.client.id}
                className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs disabled:opacity-60"
                style={{ color: "var(--text-primary)", border: "1px solid var(--border)" }}
              >
                {revoking === grant.client.id && <Loader2 className="w-3 h-3 animate-spin" aria-hidden />}
                Disconnect
              </button>
            </li>
          ))}
        </ul>
      )}
      {revokeError && (
        <p className="text-xs mt-2" style={{ color: "var(--red)" }} role="alert">
          Couldn&apos;t disconnect: {revokeError}
        </p>
      )}
      <p className="text-xs mt-2 leading-snug" style={{ color: "var(--text-muted)" }}>
        Disconnecting stops Claude from renewing its sign-in. The sign-in it already has can last up to an hour.
      </p>
    </section>
  );
}
