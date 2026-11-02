"use client";

import { useMemo, useState } from "react";
import { Loader2, Sparkles, Trash2, Plus } from "lucide-react";
import type { ProjectCollection } from "@/lib/storage";
import { addExamples, countExamples, removeExamples } from "@/lib/examples";
import { useStorageVersion } from "@/hooks/useStorage";
import { useSync } from "./SyncProvider";

/**
 * "Examples" strip shown in every tool: add this tool's starter assets, or remove them.
 * Only assets marked as examples are ever removed.
 */
export function ExamplesBar({
  projectId,
  collections,
  className = "",
}: {
  projectId: string;
  collections: ProjectCollection[];
  className?: string;
}) {
  const version = useStorageVersion();
  const { reloadView } = useSync();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const count = useMemo(() => countExamples(projectId, collections), [projectId, collections.join(), version]);

  async function add() {
    setBusy(true);
    try {
      await addExamples(projectId, collections);
      reloadView();
    } finally {
      setBusy(false);
    }
  }

  function remove() {
    removeExamples(projectId, collections);
    setConfirming(false);
    reloadView();
  }

  const btn = "inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs";
  return (
    <div className={`flex items-center gap-2 flex-wrap text-xs ${className}`} style={{ color: "var(--text-muted)" }}>
      {count > 0 ? (
        confirming ? (
          <>
            <ExamplesLabel color="var(--text-secondary)">
              Remove {count} example{count === 1 ? "" : "s"}? Your own work stays.
            </ExamplesLabel>
            <button onClick={remove} className={btn} style={{ background: "var(--red)", color: "#fff" }}>
              Remove
            </button>
            <button onClick={() => setConfirming(false)} className={btn} style={{ color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <ExamplesLabel>
              {count} example{count === 1 ? "" : "s"} to learn from and edit
            </ExamplesLabel>
            <button onClick={() => setConfirming(true)} className={btn} style={{ color: "var(--text-secondary)", border: "1px solid var(--border)" }} title="Delete the example assets in this tool">
              <Trash2 className="w-3 h-3" /> Remove examples
            </button>
          </>
        )
      ) : (
        <>
          <ExamplesLabel>No examples here</ExamplesLabel>
          <button onClick={add} disabled={busy} className={btn} style={{ color: "var(--text-secondary)", border: "1px solid var(--border)" }} title="Add starter assets you can edit and learn from">
            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />} Add examples
          </button>
        </>
      )}
    </div>
  );
}

/** Keeps the sparkle on the same line as the text, so a narrow panel wraps the button rather than the icon. */
function ExamplesLabel({ color, children }: { color?: string; children: React.ReactNode }) {
  return (
    <span className="flex items-start gap-2 min-w-0" style={{ color }}>
      <Sparkles className="w-3.5 h-3.5 shrink-0 mt-px" style={{ color: "var(--tool-color, var(--accent))" }} />
      <span className="min-w-0">{children}</span>
    </span>
  );
}
