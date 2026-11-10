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
  Decision,
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
  decisions: Decision;
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
  "decisions",
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
  /** Also mirror changes that arrived from elsewhere (another tab or device). Off for the source they came from. */
  mirrorsRemote?: boolean;
}

/** key = cacheKey(collection, projectId) */
export type Snapshot = Map<string, Item[]>;

export const LOCAL_PREFIX = "gds:";

/** `format` of an "export everything" file: `{ format, version, exportedAt, projects: [<project file>, …] }`. */
export const BUNDLE_FORMAT = "gamedev-studio-bundle";

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
const remoteListeners = new Set<(changes: ChangeEvent[]) => void>();
/** Bumped per cache key, so a hook can re-render only for the collection it shows. */
const keyVersions = new Map<string, number>();
let version = 0;
/** Projects nobody here may change (shared with the user as a viewer): their writes are refused. */
let isReadOnly: (projectId: string) => boolean = () => false;
const refusedListeners = new Set<(projectId: string) => void>();

/** True (and listeners told) when a write to this project must not happen. */
function refuse(projectId: string | undefined): boolean {
  if (!projectId || !isReadOnly(projectId)) return false;
  for (const listener of refusedListeners) listener(projectId);
  return true;
}

function touchKey(key: string) {
  keyVersions.set(key, (keyVersions.get(key) ?? 0) + 1);
}

function touchEvent(event: ChangeEvent) {
  if (event.op !== "deleteProject") return touchKey(cacheKey(event.collection, event.projectId));
  touchKey(cacheKey("projects"));
  for (const col of PROJECT_COLLECTIONS) touchKey(cacheKey(col, event.projectId));
}

function emit(event: ChangeEvent) {
  version++;
  touchEvent(event);
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
    if (refuse(collection === "projects" ? stored.id : projectId)) return;
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
    if (refuse(projectId)) return;
    const key = cacheKey(collection, projectId);
    cache.set(key, (cache.get(key) ?? []).filter((i) => i.id !== id));
    if (projectId) removeRelationsTo(projectId, id);
    emit({ op: "delete", collection, projectId, id });
  },

  deleteProject(projectId: string): void {
    if (refuse(projectId)) return;
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

  /** A counter that changes only when this collection (of this project) changes. */
  versionOf(collection: CollectionName, projectId?: string): number {
    return keyVersions.get(cacheKey(collection, projectId)) ?? 0;
  },

  /** Decides which projects are read-only; their saves and deletes are dropped before reaching the cache. */
  setReadOnly(predicate: (projectId: string) => boolean): void {
    isReadOnly = predicate;
  },

  /** Hears every refused write, with the read-only project it was meant for. */
  onRefused(listener: (projectId: string) => void): () => void {
    refusedListeners.add(listener);
    return () => refusedListeners.delete(listener);
  },

  /** Hears changes that came from another tab, device or the MCP server, after they are in the cache. */
  onRemoteChange(listener: (changes: ChangeEvent[]) => void): () => void {
    remoteListeners.add(listener);
    return () => remoteListeners.delete(listener);
  },

  exportProjectData(projectId: string): Record<string, unknown> {
    const data: Record<string, unknown> = { format: "gamedev-studio", version: 1 };
    for (const col of PROJECT_COLLECTIONS) data[col] = this.getAll(col, projectId);
    data.project = this.getById("projects", projectId);
    return data;
  },

  exportProject(projectId: string): string {
    return JSON.stringify(this.exportProjectData(projectId), null, 2);
  },

  /** Reads one project file, or an "export everything" file (every project, each keeping its app). */
  importProject(json: string): Project | null {
    try {
      const data = JSON.parse(json);
      if (data.format === BUNDLE_FORMAT && Array.isArray(data.projects)) {
        const imported = data.projects.map((entry: unknown) => this.importProjectData(entry, true));
        return imported.find(Boolean) ?? null;
      }
      return this.importProjectData(data, false);
    } catch {
      return null;
    }
  },

  importProjectData(data: unknown, keepApp: boolean): Project | null {
    const file = data as Record<string, unknown> & { project?: Project };
    if (!file?.project?.id) return null;
    // a single file exported from the other app becomes a project of this one
    const project: Project = keepApp ? file.project : { ...file.project, app: APP.id };
    this.save("projects", project);
    for (const col of PROJECT_COLLECTIONS) {
      const items = file[col];
      if (!Array.isArray(items)) continue;
      for (const item of items) this.save(col, item, project.id);
    }
    return project;
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

function applyRemoteChange(change: ChangeEvent): boolean {
  if (change.op === "deleteProject") {
    const key = cacheKey("projects");
    const projects = cache.get(key) ?? [];
    const hasData = PROJECT_COLLECTIONS.some((col) => cache.has(cacheKey(col, change.projectId)));
    if (!hasData && !projects.some((p) => p.id === change.projectId)) return false;
    cache.set(key, projects.filter((p) => p.id !== change.projectId));
    for (const col of PROJECT_COLLECTIONS) cache.delete(cacheKey(col, change.projectId));
    return true;
  }
  const key = cacheKey(change.collection, change.projectId);
  const items = cache.get(key) ?? [];
  if (change.op === "delete") {
    if (!items.some((i) => i.id === change.id)) return false;
    cache.set(key, items.filter((i) => i.id !== change.id));
    return true;
  }
  const index = items.findIndex((i) => i.id === change.item.id);
  if (index >= 0 && JSON.stringify(items[index]) === JSON.stringify(change.item)) return false;
  const next = [...items];
  if (index >= 0) next[index] = change.item;
  else next.push(change.item);
  cache.set(key, next);
  return true;
}

/**
 * Put changes made elsewhere (another tab, device or the MCP server) into the cache. They are not
 * sent back to where they came from: only persisters with `mirrorsRemote` hear about them.
 * Returns the changes that actually altered the cache.
 */
export function applyRemoteChanges(changes: ChangeEvent[]): ChangeEvent[] {
  const applied = changes.filter(applyRemoteChange);
  if (!applied.length) return applied;
  version++;
  for (const change of applied) {
    touchEvent(change);
    for (const p of persisters) {
      if (!p.mirrorsRemote) continue;
      try {
        p.onChange(change, cache);
      } catch (err) {
        console.error(`[storage] ${p.name} failed`, err);
      }
    }
  }
  for (const l of listeners) l();
  for (const l of remoteListeners) l(applied);
  return applied;
}

/** Where a cached project item lives, for remote deletes that only carry its id. */
export function locateCached(id: string): { collection: ProjectCollection; projectId: string } | null {
  for (const [key, items] of cache) {
    const parsed = parseCacheKey(key);
    if (!parsed?.projectId || !items.some((i) => i.id === id)) continue;
    return { collection: parsed.collection as ProjectCollection, projectId: parsed.projectId };
  }
  return null;
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
