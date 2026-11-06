"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Sparkles, X } from "lucide-react";
import { useDialogKeys, useFocusOnOpen } from "@/hooks/useDialogFocus";
import { APP } from "@/lib/app-config";
import { APP_VERSION, changelogForApp, entriesNewerThan, type ChangelogEntry } from "@/lib/changelog";

const SEEN_VERSION_KEY = "gds-whats-new-seen-version";
/** Opens before the tool tutorial checks for other dialogs, so the tutorial waits its turn. */
const OPEN_DELAY_MS = 300;

const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function readSeenVersion(): string | null {
  try {
    return localStorage.getItem(SEEN_VERSION_KEY);
  } catch {
    return null;
  }
}

function markVersionSeen() {
  try {
    localStorage.setItem(SEEN_VERSION_KEY, APP_VERSION);
  } catch {
    // Storage blocked: the popup may show again next time.
  }
}

/** Shows what changed once after an update. A first visit only remembers the version, so newcomers aren't greeted with a changelog. */
export function WhatsNewOnUpdate() {
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const seen = readSeenVersion();
      const newer = entriesNewerThan(seen, APP.assetTypes);
      if (newer.length > 0) setEntries(newer);
      else if (seen !== APP_VERSION) markVersionSeen();
    }, OPEN_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);

  if (entries.length === 0) return null;

  function close() {
    markVersionSeen();
    setEntries([]);
  }

  return (
    <WhatsNewDialog
      title={`${APP.name} has been updated`}
      summary="Here's what changed since you were last here."
      entries={entries}
      onClose={close}
    />
  );
}

/** Sidebar footer link that opens the whole changelog. */
export function WhatsNewButton() {
  const [isOpen, setIsOpen] = useState(false);

  function close() {
    markVersionSeen();
    setIsOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="w-full flex items-center gap-1.5 px-2 py-1 mb-2 rounded-lg text-xs"
        style={{ color: "var(--text-secondary)" }}
        title="See what changed in each version"
      >
        <Sparkles className="w-3.5 h-3.5" aria-hidden />
        What&apos;s new
        <span className="ml-auto" style={{ color: "var(--text-muted)" }}>
          v{APP_VERSION}
        </span>
      </button>
      {isOpen && (
        <WhatsNewDialog title={`What's new in ${APP.name}`} entries={changelogForApp(APP.assetTypes)} onClose={close} />
      )}
    </>
  );
}

function WhatsNewDialog({ title, summary, entries, onClose }: { title: string; summary?: string; entries: ChangelogEntry[]; onClose(): void }) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const gotItRef = useRef<HTMLButtonElement>(null);
  useDialogKeys(panelRef, onClose);
  useFocusOnOpen(gotItRef);

  return createPortal(
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md max-h-[calc(100dvh-2rem)] flex flex-col rounded-2xl shadow-2xl break-words"
        style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 p-6 pb-0 max-md:p-4 max-md:pb-0">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--accent)" }}>
              What&apos;s new
            </p>
            <h2 id={titleId} className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
              {title}
            </h2>
            {summary && (
              <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
                {summary}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} className="shrink-0 p-1 rounded" style={{ color: "var(--text-muted)" }} title="Close" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-6 max-md:px-4 py-4 space-y-5">
          {entries.map((entry) => (
            <ChangelogSection key={entry.version} entry={entry} />
          ))}
        </div>
        <div className="flex justify-end p-6 pt-0 max-md:p-4 max-md:pt-0">
          <button ref={gotItRef} type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium max-md:w-full" style={{ background: "var(--accent)" }}>
            Got it
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ChangelogSection({ entry }: { entry: ChangelogEntry }) {
  return (
    <section>
      <h3 className="flex items-baseline gap-2 text-sm font-medium" style={{ color: "var(--text-primary)" }}>
        v{entry.version}
        <span className="text-xs font-normal" style={{ color: "var(--text-muted)" }}>
          {DATE_FORMAT.format(new Date(`${entry.date}T00:00:00Z`))}
        </span>
      </h3>
      <ul className="mt-2 space-y-1.5 text-sm leading-snug list-disc pl-5" style={{ color: "var(--text-secondary)" }}>
        {entry.items.map((item) => (
          <li key={item.text}>{item.text}</li>
        ))}
      </ul>
    </section>
  );
}
