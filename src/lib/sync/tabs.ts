import { cacheKey, parseCacheKey, type ChangeEvent, type Snapshot } from "../storage";

type Item = { id: string };

function parseItems(value: string | null): Item[] | null {
  if (value === null) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * The cache changes behind another tab's write to one localStorage key (a `storage` event):
 * the browser persister stores each collection as one key, so compare it item by item.
 */
export function changesFromStorageEvent(key: string | null, newValue: string | null, cache: Snapshot): ChangeEvent[] {
  const parsed = key ? parseCacheKey(key) : null;
  const incoming = parseItems(newValue);
  if (!key || !parsed || !incoming) return [];
  const current = cache.get(cacheKey(parsed.collection, parsed.projectId)) ?? [];
  const incomingIds = new Set(incoming.map((i) => i.id));
  const changes: ChangeEvent[] = [];
  for (const item of current) {
    if (incomingIds.has(item.id)) continue;
    changes.push(
      parsed.collection === "projects"
        ? { op: "deleteProject", projectId: item.id }
        : { op: "delete", collection: parsed.collection, projectId: parsed.projectId, id: item.id }
    );
  }
  const byId = new Map(current.map((i) => [i.id, JSON.stringify(i)]));
  for (const item of incoming) {
    if (byId.get(item.id) === JSON.stringify(item)) continue;
    changes.push({ op: "put", collection: parsed.collection, projectId: parsed.projectId, item });
  }
  return changes;
}

/** Hears what other tabs of this browser save (guests keep their data in localStorage). Returns the unsubscribe. */
export function listenToOtherTabs(getCache: () => Snapshot, apply: (changes: ChangeEvent[]) => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.storageArea !== localStorage) return;
    const changes = changesFromStorageEvent(e.key, e.newValue, getCache());
    if (changes.length) apply(changes);
  };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}
