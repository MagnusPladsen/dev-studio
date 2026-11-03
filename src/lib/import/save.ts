import { storage, type ProjectCollection, type StorableTypes } from "@/lib/storage";
import type { ImportStep } from "./types";

export interface SavedImport<T> {
  items: T[];
  /** Deletes the imported items again (their links go with them). */
  remove(): void;
  /** Saves them back after `remove`. */
  restore(): void;
}

/**
 * Saves imported items as new assets of this project: sets `projectId` and fresh timestamps, and drops the `example`
 * flag so "Remove examples" never deletes something the user imported.
 */
export function saveImportedAssets<K extends ProjectCollection>(collection: K, projectId: string, items: StorableTypes[K][]): SavedImport<StorableTypes[K]> {
  const now = new Date().toISOString();
  const saved = items.map((item) => {
    const copy = { ...item, projectId, createdAt: now, updatedAt: now } as StorableTypes[K] & { example?: boolean };
    delete copy.example;
    return copy as StorableTypes[K];
  });
  const restore = () => saved.forEach((item) => storage.save(collection, item, projectId));
  restore();
  return {
    items: saved,
    remove: () => saved.forEach((item) => storage.delete(collection, (item as { id: string }).id, projectId)),
    restore,
  };
}

export interface OpenImportedAsset<T> {
  /** What was open before the import (null for the tool's list); undo goes back to it. */
  previousId: string | null;
  /** Shows the given item, e.g. opens the imported canvas. */
  open(item: T): void;
  /** Goes back after undo: open `previous`, or the tool's list when it is gone or there was none. */
  back(previous: T | undefined): void;
}

/**
 * The usual import for list-style tools: save the items as new assets, open the first, and return the undo step
 * that deletes them again and goes back to what was open before.
 */
export function importAsNewAssets<K extends ProjectCollection>(
  collection: K,
  projectId: string,
  items: StorableTypes[K][],
  { previousId, open, back }: OpenImportedAsset<StorableTypes[K]>
): ImportStep {
  const saved = saveImportedAssets(collection, projectId, items);
  const first = saved.items[0];
  open(first);
  return {
    openedId: (first as { id: string }).id,
    undo() {
      saved.remove();
      back(previousId ? storage.getById(collection, previousId, projectId) : undefined);
    },
    redo() {
      saved.restore();
      open(first);
    },
  };
}
