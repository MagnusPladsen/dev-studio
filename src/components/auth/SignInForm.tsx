"use client";

import { useState } from "react";
import { Loader2, Mail } from "lucide-react";
import { GithubMark } from "@/components/GithubMark";

interface SignInFormProps {
  /** Each returns an error message, or null once the sign-in has started. */
  onGitHub(): Promise<string | null>;
  onEmail(email: string): Promise<string | null>;
  /** Shown after the email is sent, under "Check <email> for a sign-in link." */
  sentNote: string;
}

/** GitHub button + magic-link email field, for the sign-in pages outside the studio. */
export function SignInForm({ onGitHub, onEmail, sentNote }: SignInFormProps) {
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendLink(event: React.FormEvent) {
    event.preventDefault();
    const address = email.trim();
    if (!address) return;
    setIsBusy(true);
    setError(null);
    const message = await onEmail(address);
    setIsBusy(false);
    if (message) setError(message);
    else setSentTo(address);
  }

  if (sentTo) {
    return (
      <div className="text-sm p-3 rounded-lg flex gap-2" style={{ background: "var(--bg-card)", color: "var(--text-primary)" }} role="status">
        <Mail className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "var(--green)" }} />
        <span>
          Check <b className="break-all">{sentTo}</b> for a sign-in link. {sentNote}
        </span>
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={async () => setError(await onGitHub())}
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
          autoComplete="email"
          placeholder="you@example.com"
          aria-label="Email address"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="w-full px-3 py-2 rounded-lg text-sm outline-none"
          style={{ background: "var(--bg-primary)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
        />
        <button
          type="submit"
          disabled={isBusy}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-60"
          style={{ background: "var(--accent)", color: "white" }}
        >
          {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
          Email me a sign-in link
        </button>
      </form>
      {error && (
        <p className="text-xs mt-3" style={{ color: "var(--red)" }} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
