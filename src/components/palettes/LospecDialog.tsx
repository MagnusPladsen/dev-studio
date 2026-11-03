"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { lospecJsonUrl, lospecSlug } from "@/lib/import/palettes";

const FETCH_TIMEOUT_MS = 8000;
const MAX_RESPONSE_BYTES = 64 * 1024;

type Fetched = { ok: true; file: File } | { ok: false; message: string };

/** Downloads a Lospec palette's JSON straight from lospec.com (it allows browser requests), within a time and size limit. */
async function fetchLospecPalette(slug: string): Promise<Fetched> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(lospecJsonUrl(slug), { signal: controller.signal, credentials: "omit", referrerPolicy: "no-referrer" });
    if (response.status === 404) return { ok: false, message: `Lospec has no palette called "${slug}". Check the name on lospec.com/palette-list.` };
    if (!response.ok) return { ok: false, message: "Lospec didn't send the palette. Try again in a moment." };
    if (Number(response.headers.get("content-length")) > MAX_RESPONSE_BYTES) return { ok: false, message: "That palette is too big to import." };
    const text = await response.text();
    if (text.length > MAX_RESPONSE_BYTES) return { ok: false, message: "That palette is too big to import." };
    return { ok: true, file: new File([text], `${slug}.json`, { type: "application/json" }) };
  } catch {
    // lospec.com answers unknown names without CORS headers, so a missing palette also lands here
    if (controller.signal.aborted) return { ok: false, message: "Lospec took too long to answer. Try again." };
    return { ok: false, message: `Couldn't get "${slug}" from Lospec. Check the name on lospec.com/palette-list, or try again if you're offline.` };
  } finally {
    clearTimeout(timer);
  }
}

interface Props {
  /** Imports the downloaded palette file; resolves once the import has finished (or failed). */
  onImport(file: File): Promise<void>;
  onClose(): void;
}

export function LospecDialog({ onImport, onClose }: Props): React.JSX.Element {
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const slug = lospecSlug(input);

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!slug || isLoading) return;
    setIsLoading(true);
    setError(null);
    const fetched = await fetchLospecPalette(slug);
    setIsLoading(false);
    if (!fetched.ok) return setError(fetched.message);
    await onImport(fetched.file);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose} role="dialog" aria-modal="true" aria-label="Import a palette from Lospec">
      <form
        onSubmit={submit}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-sm rounded-2xl p-5 shadow-2xl"
        style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
      >
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Palette from Lospec</h2>
          <button type="button" onClick={onClose} className="p-1 rounded" style={{ color: "var(--text-primary)" }} title="Close" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
          Type a palette&apos;s name or paste its link from lospec.com/palette-list.
        </p>
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Endesga 32"
          className="w-full px-2.5 py-1.5 rounded-md text-sm outline-none"
          style={{ background: "var(--bg-primary)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
          aria-label="Lospec palette name or link"
          autoFocus
        />
        <p className="text-[11px] mt-1.5 min-h-4" style={{ color: error ? "var(--red)" : "var(--text-muted)" }} role={error ? "alert" : undefined}>
          {error ?? (input.trim() && !slug ? "That isn't a Lospec palette name or link." : slug ? `lospec.com/palette-list/${slug}` : "")}
        </p>
        <div className="flex justify-end gap-2 mt-3">
          <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-md text-xs" style={{ color: "var(--text-primary)", border: "1px solid var(--border)" }}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={!slug || isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium disabled:opacity-50"
            style={{ background: "var(--accent)", color: "var(--on-accent, #fff)" }}
          >
            {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Import
          </button>
        </div>
      </form>
    </div>
  );
}
