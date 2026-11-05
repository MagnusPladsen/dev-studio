"use client";

import type { SfxParams } from "@/types";

export interface SfxDraft {
  id: string;
  label: string;
  params: SfxParams;
}

/** How many recent drafts the strip keeps. */
export const MAX_DRAFTS = 10;

/** The last generated or mutated sounds, newest first. Clicking one plays it and makes it the current sound again. */
export function SfxDraftsStrip({ drafts, current, onRestore }: { drafts: SfxDraft[]; current: SfxParams; onRestore: (draft: SfxDraft) => void }) {
  return (
    <div className="flex items-center gap-2 mt-3 min-w-0">
      <span className="text-xs font-medium shrink-0" style={{ color: "var(--text-muted)" }}>
        Recent
      </span>
      {drafts.length === 0 ? (
        <span className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
          Sounds you generate or mutate show up here to compare.
        </span>
      ) : (
        <div className="flex gap-1 overflow-x-auto min-w-0 pb-0.5">
          {drafts.map((draft, index) => {
            const isCurrent = draft.params === current;
            return (
              <button
                key={draft.id}
                onClick={() => onRestore(draft)}
                aria-pressed={isCurrent}
                aria-label={`Play and use draft ${index + 1}: ${draft.label}`}
                title={`Play and use this draft (${draft.label})`}
                className="shrink-0 px-2 py-1 rounded-md text-[11px] font-medium whitespace-nowrap"
                style={{
                  background: isCurrent ? "var(--accent)" : "var(--bg-hover)",
                  color: isCurrent ? "var(--on-accent, white)" : "var(--text-primary)",
                  border: `1px solid ${isCurrent ? "var(--accent)" : "var(--border)"}`,
                }}
              >
                {draft.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
