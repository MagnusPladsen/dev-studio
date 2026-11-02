import type {
  Project,
  Sprite,
  SoundEffect,
  MusicTrack,
  Diagram,
  StoryEntry,
  TilemapData,
  DialogueTree,
  Palette,
  SpriteSheet,
  AssetRelation,
  Note,
  Board,
  Issue,
  VoxelModel,
} from "@/types";
import { APP } from "./app-config";

export type StorableTypes = {
  projects: Project;
  sprites: Sprite;
  sounds: SoundEffect;
  music: MusicTrack;
  diagrams: Diagram;
  stories: StoryEntry;
  tilemaps: TilemapData;
  dialogues: DialogueTree;
  palettes: Palette;
  spritesheets: SpriteSheet;
  links: AssetRelation;
  notes: Note;
  boards: Board;
  issues: Issue;
  models: VoxelModel;
};

export type CollectionName = keyof StorableTypes;
export type ProjectCollection = Exclude<CollectionName, "projects">;

export const PROJECT_COLLECTIONS: ProjectCollection[] = [
  "sprites",
  "sounds",
  "music",
  "diagrams",
  "stories",
  "tilemaps",
  "dialogues",
  "palettes",
  "spritesheets",
  "notes",
  "boards",
  "issues",
  "models",
  "links",
];

type Item = { id: string; updatedAt?: string; createdAt?: string };

export type ChangeEvent =
  | { op: "put"; collection: CollectionName; projectId?: string; item: Item }
  | { op: "delete"; collection: CollectionName; projectId?: string; id: string }
  | { op: "deleteProject"; projectId: string };

/** Something that persists cache changes somewhere (browser, Supabase, a folder). */
export interface Persister {
  name: string;
  onChange(event: ChangeEvent, snapshot: Snapshot): void;
}

/** key = cacheKey(collection, projectId) */
export type Snapshot = Map<string, Item[]>;

export const LOCAL_PREFIX = "gds:";

export function cacheKey(collection: CollectionName, projectId?: string): string {
  if (collection === "projects" || !projectId) return `${LOCAL_PREFIX}${collection}`;
  return `${LOCAL_PREFIX}${projectId}:${collection}`;
}

export function parseCacheKey(key: string): { collection: CollectionName; projectId?: string } | null {
  if (!key.startsWith(LOCAL_PREFIX)) return null;
  const parts = key.slice(LOCAL_PREFIX.length).split(":");
  if (parts.length === 1 && parts[0] === "projects") return { collection: "projects" };
  if (parts.length === 2 && (PROJECT_COLLECTIONS as string[]).includes(parts[1])) {
    return { projectId: parts[0], collection: parts[1] as CollectionName };
  }
  return null;
}

export function itemTime(item: Item): number {
  return Date.parse(item.updatedAt ?? item.createdAt ?? "") || 0;
}

const cache: Snapshot = new Map();
const persisters = new Set<Persister>();
const listeners = new Set<() => void>();
let version = 0;

function emit(event: ChangeEvent) {
  version++;
  for (const p of persisters) {
    try {
      p.onChange(event, cache);
    } catch (err) {
      console.error(`[storage] ${p.name} failed`, err);
    }
  }
  for (const l of listeners) l();
}

export const storage = {
  getAll<K extends CollectionName>(collection: K, projectId?: string): StorableTypes[K][] {
    return [...((cache.get(cacheKey(collection, projectId)) ?? []) as StorableTypes[K][])];
  },

  getById<K extends CollectionName>(collection: K, id: string, projectId?: string): StorableTypes[K] | undefined {
    return (cache.get(cacheKey(collection, projectId)) ?? []).find((i) => i.id === id) as StorableTypes[K] | undefined;
  },

  save<K extends CollectionName>(collection: K, item: StorableTypes[K], projectId?: string): void {
    const key = cacheKey(collection, projectId);
    const items = [...(cache.get(key) ?? [])];
    const stored = item as unknown as Item;
    const index = items.findIndex((i) => i.id === stored.id);
    if (index >= 0) items[index] = stored;
    else items.push(stored);
    cache.set(key, items);
    emit({ op: "put", collection, projectId, item: stored });
  },

  delete<K extends CollectionName>(collection: K, id: string, projectId?: string): void {
    if (collection === "projects") {
      this.deleteProject(id);
      return;
    }
    const key = cacheKey(collection, projectId);
    cache.set(key, (cache.get(key) ?? []).filter((i) => i.id !== id));
    if (projectId) removeRelationsTo(projectId, id);
    emit({ op: "delete", collection, projectId, id });
  },

  deleteProject(projectId: string): void {
    const key = cacheKey("projects");
    cache.set(key, (cache.get(key) ?? []).filter((i) => i.id !== projectId));
    for (const col of PROJECT_COLLECTIONS) cache.delete(cacheKey(col, projectId));
    emit({ op: "deleteProject", projectId });
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  version(): number {
    return version;
  },

  exportProject(projectId: string): string {
    const data: Record<string, unknown> = { format: "gamedev-studio", version: 1 };
    for (const col of PROJECT_COLLECTIONS) data[col] = this.getAll(col, projectId);
    data.project = this.getById("projects", projectId);
    return JSON.stringify(data, null, 2);
  },

  importProject(json: string): Project | null {
    try {
      const data = JSON.parse(json);
      if (!data.project?.id) return null;
      // a file exported from the other app becomes a project of this one
      const project: Project = { ...data.project, app: APP.id };
      this.save("projects", project);
      for (const col of PROJECT_COLLECTIONS) {
        if (!Array.isArray(data[col])) continue;
        for (const item of data[col]) this.save(col, item, project.id);
      }
      return project;
    } catch {
      return null;
    }
  },
};

function removeRelationsTo(projectId: string, assetId: string) {
  const key = cacheKey("links", projectId);
  const links = (cache.get(key) ?? []) as AssetRelation[];
  const stale = links.filter((l) => l.from.id === assetId || l.to.id === assetId);
  if (stale.length === 0) return;
  cache.set(key, links.filter((l) => !stale.includes(l)));
  for (const l of stale) emit({ op: "delete", collection: "links", projectId, id: l.id });
}

/** Replace the whole cache (used when switching between browser, cloud and folder data). */
export function replaceCache(snapshot: Snapshot) {
  cache.clear();
  for (const [k, v] of snapshot) cache.set(k, [...v]);
  version++;
  for (const l of listeners) l();
}

/** Merge items into the cache, keeping whichever copy is newer. Returns the items that changed. */
export function mergeIntoCache(snapshot: Snapshot): ChangeEvent[] {
  const changes: ChangeEvent[] = [];
  for (const [key, incoming] of snapshot) {
    const parsed = parseCacheKey(key);
    if (!parsed) continue;
    const items = [...(cache.get(key) ?? [])];
    for (const item of incoming) {
      const index = items.findIndex((i) => i.id === item.id);
      if (index === -1) items.push(item);
      else if (itemTime(item) > itemTime(items[index])) items[index] = item;
      else continue;
      changes.push({ op: "put", collection: parsed.collection, projectId: parsed.projectId, item });
    }
    cache.set(key, items);
  }
  if (changes.length) {
    version++;
    for (const l of listeners) l();
  }
  return changes;
}

export function getSnapshot(): Snapshot {
  return cache;
}

export function addPersister(p: Persister) {
  persisters.add(p);
  return () => {
    persisters.delete(p);
  };
}

/** Tell one persister about every item currently cached (initial upload to a new destination). */
export function replayAll(p: Persister) {
  for (const [key, items] of cache) {
    const parsed = parseCacheKey(key);
    if (!parsed) continue;
    for (const item of items) p.onChange({ op: "put", collection: parsed.collection, projectId: parsed.projectId, item }, cache);
  }
}

// ── browser localStorage persistence ────────────────────────────────

export function readLocalSnapshot(): Snapshot {
  const snap: Snapshot = new Map();
  if (typeof window === "undefined") return snap;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !parseCacheKey(key)) continue;
    try {
      const value = JSON.parse(localStorage.getItem(key) ?? "[]");
      if (Array.isArray(value)) snap.set(key, value);
    } catch {
      // ignore corrupt entries
    }
  }
  return snap;
}

export function localHasData(): boolean {
  for (const items of readLocalSnapshot().values()) if (items.length) return true;
  return false;
}

export function clearLocalData() {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && parseCacheKey(key)) keys.push(key);
  }
  for (const k of keys) localStorage.removeItem(k);
}

export function createLocalPersister(onError: (message: string) => void): Persister {
  const write = (key: string, snapshot: Snapshot) => {
    try {
      const items = snapshot.get(key);
      if (items && items.length) localStorage.setItem(key, JSON.stringify(items));
      else localStorage.removeItem(key);
    } catch {
      onError("Browser storage is full. Sign in or connect a local folder to keep saving.");
    }
  };
  return {
    name: "browser",
    onChange(event, snapshot) {
      if (event.op === "deleteProject") {
        write(cacheKey("projects"), snapshot);
        for (const col of PROJECT_COLLECTIONS) localStorage.removeItem(cacheKey(col, event.projectId));
        return;
      }
      write(cacheKey(event.collection, event.projectId), snapshot);
    },
  };
}
