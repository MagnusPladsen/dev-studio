import type { CollectionName } from "./storage";

const live = new Map<CollectionName, number>();

/** Notes that a mounted editor applies remote changes to these collections itself. Returns the undo. */
export function markLive(collections: CollectionName[]): () => void {
  for (const c of collections) live.set(c, (live.get(c) ?? 0) + 1);
  return () => {
    for (const c of collections) live.set(c, (live.get(c) ?? 1) - 1);
  };
}

/** Whether an editor on screen keeps this collection in step itself, so it needs no re-mount. */
export function isLive(collection: CollectionName): boolean {
  return (live.get(collection) ?? 0) > 0;
}
