"use client";

import { useEffect, useRef, useState } from "react";
import { storage, type ChangeEvent, type CollectionName } from "@/lib/storage";
import { markLive } from "@/lib/live-editors";

/**
 * Live updates in an editor: hands `onChange` the changes to these collections of this project that
 * came from another tab, device or the MCP server (they are already in storage), and returns a
 * counter that goes up whenever `onChange` returns true (or, without `onChange`, on every such change).
 *
 * The rule every live editor follows:
 * - An edit made here that hasn't been saved yet wins. The editor keeps it and saves it over the
 *   remote change.
 * - Otherwise the remote copy replaces what is on screen. Selection, open panels, scroll and zoom stay.
 * - A remote change to what the editor shows starts a fresh undo history (put the counter in
 *   `useHistory`'s reset key, and `useAutosave`'s so the remote copy isn't saved back), so undo
 *   never reverts someone else's change.
 */
export function useRemoteChanges(
  collections: CollectionName[],
  projectId: string,
  onChange?: (changes: ChangeEvent[]) => boolean | void
): number {
  const [revision, setRevision] = useState(0);
  const handler = useRef(onChange);
  useEffect(() => {
    handler.current = onChange;
  });
  const key = collections.join(",");

  useEffect(() => {
    const watched = key.split(",") as CollectionName[];
    const unmark = markLive(watched);
    const unsubscribe = storage.onRemoteChange((changes) => {
      const relevant = changes.filter((c) =>
        c.op === "deleteProject" ? c.projectId === projectId : c.projectId === projectId && watched.includes(c.collection)
      );
      if (!relevant.length) return;
      const affectsView = handler.current ? handler.current(relevant) : true;
      if (affectsView) setRevision((r) => r + 1);
    });
    return () => {
      unsubscribe();
      unmark();
    };
  }, [key, projectId]);

  return revision;
}
