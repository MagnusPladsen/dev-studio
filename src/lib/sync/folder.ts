import {
  cacheKey,
  PROJECT_COLLECTIONS,
  type ChangeEvent,
  type CollectionName,
  type Persister,
  type Snapshot,
} from "../storage";

// File System Access API — Chromium only. Types are not in TS's DOM lib yet.
type PermissionMode = { mode: "readwrite" };
type DirHandle = FileSystemDirectoryHandle & {
  queryPermission(opts: PermissionMode): Promise<PermissionState>;
  requestPermission(opts: PermissionMode): Promise<PermissionState>;
  values(): AsyncIterableIterator<FileSystemHandle>;
};
declare global {
  interface Window {
    showDirectoryPicker?: (opts?: { id?: string; mode?: "readwrite" }) => Promise<DirHandle>;
  }
}

export type FolderHandle = DirHandle;

export const folderSupported = () => typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";

// ── remember the chosen folder across reloads (handles can be stored in IndexedDB) ──
const DB = "gamedev-studio";
const STORE = "handles";

function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const req = fn(open.result.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    };
  });
}

export const rememberFolder = (h: FolderHandle) => idb("readwrite", (s) => s.put(h, "folder"));
export const forgetFolder = () => idb("readwrite", (s) => s.delete("folder"));
export const recallFolder = () => idb<FolderHandle | undefined>("readonly", (s) => s.get("folder")).catch(() => undefined);

export async function pickFolder(): Promise<FolderHandle> {
  return window.showDirectoryPicker!({ id: "gamedev-studio", mode: "readwrite" });
}

// ── layout on disk ──
//   <folder>/projects.json
//   <folder>/<projectId>/<collection>.json
const fileFor = (collection: CollectionName) => `${collection}.json`;

async function readJson(dir: FileSystemDirectoryHandle, name: string): Promise<unknown[] | null> {
  try {
    const file = await (await dir.getFileHandle(name)).getFile();
    const value = JSON.parse(await file.text());
    return Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

async function writeJson(dir: FileSystemDirectoryHandle, name: string, items: unknown[]) {
  const handle = await dir.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(JSON.stringify(items, null, 2));
  await writable.close();
}

export async function readFolderSnapshot(root: FolderHandle): Promise<Snapshot> {
  const snap: Snapshot = new Map();
  const projects = (await readJson(root, "projects.json")) as { id: string }[] | null;
  if (!projects) return snap;
  snap.set(cacheKey("projects"), projects);
  for (const p of projects) {
    let dir: FileSystemDirectoryHandle;
    try {
      dir = await root.getDirectoryHandle(p.id);
    } catch {
      continue;
    }
    for (const col of PROJECT_COLLECTIONS) {
      const items = (await readJson(dir, fileFor(col))) as { id: string }[] | null;
      if (items?.length) snap.set(cacheKey(col, p.id), items);
    }
  }
  return snap;
}

/** Writes changed collections to the folder, a moment after the last edit. */
export function createFolderPersister(root: FolderHandle, onError: (message: string) => void): Persister & { writeAll(s: Snapshot): Promise<void> } {
  const dirty = new Set<string>();
  const removedProjects = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let latest: Snapshot | null = null;
  let chain = Promise.resolve();

  async function writeKey(key: string, snap: Snapshot) {
    const items = snap.get(key) ?? [];
    if (key === cacheKey("projects")) return writeJson(root, "projects.json", items);
    const [projectId, col] = key.slice("gds:".length).split(":");
    const dir = await root.getDirectoryHandle(projectId, { create: true });
    if (items.length) await writeJson(dir, fileFor(col as CollectionName), items);
    else await dir.removeEntry(fileFor(col as CollectionName)).catch(() => {});
  }

  function flush() {
    const snap = latest;
    if (!snap) return;
    const keys = [...dirty];
    const gone = [...removedProjects];
    dirty.clear();
    removedProjects.clear();
    chain = chain
      .then(async () => {
        for (const id of gone) await root.removeEntry(id, { recursive: true }).catch(() => {});
        for (const k of keys) await writeKey(k, snap);
      })
      .catch((err: Error) => onError(`Could not write to the folder: ${err.message}`));
  }

  return {
    name: "folder",
    // the folder is a mirror of the cache, so it takes changes from other tabs and devices too
    mirrorsRemote: true,
    onChange(event: ChangeEvent, snap: Snapshot) {
      latest = snap;
      if (event.op === "deleteProject") {
        removedProjects.add(event.projectId);
        dirty.add(cacheKey("projects"));
      } else {
        dirty.add(cacheKey(event.collection, event.projectId));
      }
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, 500);
    },
    async writeAll(snap: Snapshot) {
      latest = snap;
      for (const key of snap.keys()) dirty.add(key);
      flush();
      await chain;
    },
  };
}
