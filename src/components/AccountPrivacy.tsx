"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, Loader2, Shield, Trash2, X } from "lucide-react";
import { useSync } from "./SyncProvider";
import { APP } from "@/lib/app-config";
import { downloadEverything } from "@/lib/export-everything";

type EraseMode = "delete-account" | "clear-device";

const ERASE_TEXT: Record<EraseMode, { title: string; body: string; confirmWord: string; action: string }> = {
  "delete-account": {
    title: "Delete your account",
    body: "This deletes every project in your account, on every device, and your sign-in. It can't be undone. Files in a connected local folder stay on your computer.",
    confirmWord: "DELETE",
    action: "Delete account",
  },
  "clear-device": {
    title: "Clear all data on this device",
    body: `This removes every ${APP.name} project and setting saved in this browser. It can't be undone. Files in a connected local folder stay on your computer.`,
    confirmWord: "CLEAR",
    action: "Clear all data",
  },
};

function EraseDialog({ mode, onClose }: { mode: EraseMode; onClose(): void }) {
  const sync = useSync();
  const router = useRouter();
  const text = ERASE_TEXT[mode];
  const [typed, setTyped] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isConfirmed = typed.trim().toUpperCase() === text.confirmWord;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !isBusy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isBusy, onClose]);

  async function erase(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!isConfirmed) return;
    setIsBusy(true);
    setError(null);
    if (mode === "delete-account") {
      const failure = await sync.deleteAccount();
      if (failure) {
        setIsBusy(false);
        setError(`Could not delete your account: ${failure}`);
        return;
      }
    } else {
      await sync.clearDeviceData();
    }
    onClose();
    router.push("/projects");
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={() => !isBusy && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="erase-title"
    >
      <form
        onSubmit={erase}
        className="w-full max-w-md rounded-2xl p-6 sm:p-7 shadow-2xl text-sm"
        style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-2">
          <h2 id="erase-title" className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
            {text.title}
          </h2>
          <button type="button" onClick={onClose} disabled={isBusy} style={{ color: "var(--text-muted)" }} title="Close" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="leading-relaxed mb-4">{text.body}</p>
        <button
          type="button"
          onClick={() => downloadEverything(APP.id)}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg font-medium mb-4"
          style={{ background: "var(--bg-card)", color: "var(--text-primary)", border: "1px solid var(--border-hover)" }}
        >
          <Download className="w-4 h-4" />
          Export everything first
        </button>
        <label className="block mb-1.5" htmlFor="erase-confirm">
          Type <b style={{ color: "var(--text-primary)" }}>{text.confirmWord}</b> to confirm
        </label>
        <input
          id="erase-confirm"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          autoFocus
          className="w-full px-3 py-2 rounded-lg outline-none mb-4"
          style={{ background: "var(--bg-primary)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
        />
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isBusy}
            className="px-3 py-2 rounded-lg"
            style={{ color: "var(--text-primary)", border: "1px solid var(--border)" }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!isConfirmed || isBusy}
            className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg font-medium disabled:opacity-50"
            style={{ background: "var(--red)", color: "var(--bg-primary)" }}
          >
            {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            {text.action}
          </button>
        </div>
        {error && (
          <p className="text-xs mt-3" role="alert" style={{ color: "var(--red)" }}>
            {error}
          </p>
        )}
      </form>
    </div>
  );
}

/** Export everything, the privacy page, and deleting the account (or a guest's data) — the Account panel's privacy row. */
export function AccountPrivacy() {
  const { user } = useSync();
  const [eraseMode, setEraseMode] = useState<EraseMode | null>(null);
  const linkStyle = { color: "var(--text-secondary)" };

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <button onClick={() => downloadEverything(APP.id)} className="flex items-center gap-1 hover:underline" style={linkStyle} title="Download every project as one file">
        <Download className="w-3 h-3" />
        Export all
      </button>
      <Link href="/privacy" className="flex items-center gap-1 hover:underline" style={linkStyle}>
        <Shield className="w-3 h-3" />
        Privacy
      </Link>
      <button
        onClick={() => setEraseMode(user ? "delete-account" : "clear-device")}
        className="flex items-center gap-1 hover:underline"
        style={linkStyle}
      >
        <Trash2 className="w-3 h-3" />
        {user ? "Delete account" : "Clear data"}
      </button>
      {eraseMode && createPortal(<EraseDialog mode={eraseMode} onClose={() => setEraseMode(null)} />, document.body)}
    </div>
  );
}
