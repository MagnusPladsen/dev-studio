import type { SupabaseClient } from "@supabase/supabase-js";
import {
  cacheKey,
  PROJECT_COLLECTIONS,
  parseCacheKey,
  type ChangeEvent,
  type Persister,
  type Snapshot,
} from "../storage";

export type CloudTable = "projects" | "assets";
export type CloudRow = {
  id: string;
  user_id?: string;
  project_id?: string;
  collection?: string;
  data?: Record<string, unknown>;
  updated_at?: string;
};
/** A row the server confirmed writing (or deleting), with the server's `updated_at`. */
export type WrittenRow = { table: CloudTable; id: string; updatedAt?: string };
type Op =
  | { kind: "upsertProject"; id: string; data: Record<string, unknown> }
  | { kind: "deleteProject"; id: string }
  | { kind: "upsertAsset"; id: string; projectId: string; collection: string; data: Record<string, unknown> }
  | { kind: "deleteAsset"; id: string };

const PAGE = 500;
const ROW_COLUMNS: Record<CloudTable, string> = {
  projects: "id, data, updated_at",
  assets: "id, project_id, collection, data, updated_at",
};

async function selectAll(supabase: SupabaseClient, table: CloudTable, columns = ROW_COLUMNS[table], since?: string): Promise<CloudRow[]> {
  const rows: CloudRow[] = [];
  for (let from = 0; ; from += PAGE) {
    let query = supabase.from(table).select(columns);
    if (since) query = query.gt("updated_at", since);
    const { data, error } = await query.order("id").range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as unknown as CloudRow[]));
    if (!data || data.length < PAGE) return rows;
  }
}

/** Reads the cloud tables for live updates: what changed since a time, which rows exist, and single rows. */
export interface CloudReader {
  changedSince(table: CloudTable, since: string): Promise<CloudRow[]>;
  ids(table: CloudTable): Promise<string[]>;
  rows(table: CloudTable, ids: string[]): Promise<CloudRow[]>;
}

export function createCloudReader(supabase: SupabaseClient): CloudReader {
  return {
    changedSince: (table, since) => selectAll(supabase, table, ROW_COLUMNS[table], since),
    ids: async (table) => (await selectAll(supabase, table, "id")).map((r) => r.id),
    async rows(table, ids) {
      const rows: CloudRow[] = [];
      for (let i = 0; i < ids.length; i += 100) {
        const { data, error } = await supabase.from(table).select(ROW_COLUMNS[table]).in("id", ids.slice(i, i + 100));
        if (error) throw error;
        rows.push(...((data ?? []) as unknown as CloudRow[]));
      }
      return rows;
    },
  };
}

/** The newest `updated_at` among the rows, as the starting point for catching up later. */
export function newestUpdate(rows: CloudRow[]): string | null {
  let newest = 0;
  for (const r of rows) newest = Math.max(newest, Date.parse(r.updated_at ?? "") || 0);
  return newest ? new Date(newest).toISOString() : null;
}

export async function loadCloudSnapshot(supabase: SupabaseClient): Promise<{ snapshot: Snapshot; cursor: string | null }> {
  const [projects, assets] = await Promise.all([selectAll(supabase, "projects"), selectAll(supabase, "assets")]);
  const snap: Snapshot = new Map();
  snap.set(cacheKey("projects"), projects.map((r) => ({ ...r.data, id: r.id })));
  for (const a of assets) {
    if (!a.project_id || !(PROJECT_COLLECTIONS as string[]).includes(a.collection ?? "")) continue;
    const key = cacheKey(a.collection as (typeof PROJECT_COLLECTIONS)[number], a.project_id);
    const list = snap.get(key) ?? [];
    list.push({ ...a.data, id: a.id });
    snap.set(key, list);
  }
  return { snapshot: snap, cursor: newestUpdate([...projects, ...assets]) };
}

/** Upload a whole snapshot (used once when a guest signs in with local data). */
export async function uploadSnapshot(supabase: SupabaseClient, userId: string, snap: Snapshot): Promise<void> {
  const projects = (snap.get(cacheKey("projects")) ?? []).map((p) => projectRow(userId, p));
  const known = new Set(projects.map((p) => p.id));
  const assets: ReturnType<typeof assetRow>[] = [];
  for (const [key, items] of snap) {
    const parsed = parseCacheKey(key);
    if (!parsed?.projectId || !known.has(parsed.projectId)) continue;
    for (const item of items) assets.push(assetRow(userId, item, parsed.projectId, parsed.collection));
  }
  for (let i = 0; i < projects.length; i += PAGE) {
    const { error } = await supabase.from("projects").upsert(projects.slice(i, i + PAGE), { onConflict: "user_id,id" });
    if (error) throw error;
  }
  for (let i = 0; i < assets.length; i += 100) {
    const { error } = await supabase.from("assets").upsert(assets.slice(i, i + 100), { onConflict: "user_id,id" });
    if (error) throw error;
  }
}

function projectRow(userId: string, item: { id: string; [k: string]: unknown }) {
  return {
    user_id: userId,
    id: item.id,
    name: String(item.name ?? ""),
    data: item,
    updated_at: new Date().toISOString(),
  };
}

function assetRow(userId: string, item: { id: string }, projectId: string, collection: string) {
  return { user_id: userId, id: item.id, project_id: projectId, collection, data: item, updated_at: new Date().toISOString() };
}

export type SyncStatus = { state: "idle" | "saving" | "saved" | "error"; message?: string };

/**
 * Mirrors cache changes to Supabase. Writes are coalesced per item (rapid edits become one
 * request), flushed in order — projects before assets, so foreign keys hold — and retried.
 */
export function createCloudPersister(
  supabase: SupabaseClient,
  userId: string,
  onStatus: (s: SyncStatus) => void,
  onWritten: (rows: WrittenRow[]) => void = () => {}
): Persister & {
  flush(): Promise<void>;
  /** Whether a write for this row is queued or in flight (live updates hold off on it until it lands). */
  isBusy(table: CloudTable, id: string): boolean;
  /** Forget queued writes for a project that was deleted elsewhere. */
  dropProject(projectId: string): void;
} {
  const pending = new Map<string, Op>();
  let inFlight = new Map<string, Op>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running: Promise<void> | null = null;
  let failures = 0;

  const schedule = (delay = 700) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void flush(), delay);
  };

  async function run(ops: Op[]) {
    const order = { upsertProject: 0, upsertAsset: 1, deleteAsset: 2, deleteProject: 3 } as const;
    ops.sort((a, b) => order[a.kind] - order[b.kind]);

    const confirm = (table: CloudTable, rows: unknown) =>
      onWritten(((rows ?? []) as CloudRow[]).map((r) => ({ table, id: r.id, updatedAt: r.updated_at })));

    const projectUpserts = ops.filter((o) => o.kind === "upsertProject").map((o) => projectRow(userId, { ...o.data, id: o.id }));
    if (projectUpserts.length) {
      const { data, error } = await supabase.from("projects").upsert(projectUpserts, { onConflict: "user_id,id" }).select("id, updated_at");
      if (error) throw error;
      confirm("projects", data);
    }
    const assetUpserts = ops
      .filter((o): o is Extract<Op, { kind: "upsertAsset" }> => o.kind === "upsertAsset")
      .map((o) => assetRow(userId, { ...o.data, id: o.id }, o.projectId, o.collection));
    for (let i = 0; i < assetUpserts.length; i += 100) {
      const { data, error } = await supabase
        .from("assets")
        .upsert(assetUpserts.slice(i, i + 100), { onConflict: "user_id,id" })
        .select("id, updated_at");
      if (error) throw error;
      confirm("assets", data);
    }
    const assetDeletes = ops.filter((o) => o.kind === "deleteAsset").map((o) => o.id);
    if (assetDeletes.length) {
      const { data, error } = await supabase.from("assets").delete().eq("user_id", userId).in("id", assetDeletes).select("id, updated_at");
      if (error) throw error;
      confirm("assets", data);
    }
    const projectDeletes = ops.filter((o) => o.kind === "deleteProject").map((o) => o.id);
    if (projectDeletes.length) {
      const { data, error } = await supabase.from("projects").delete().eq("user_id", userId).in("id", projectDeletes).select("id, updated_at");
      if (error) throw error;
      confirm("projects", data);
    }
  }

  async function flush(): Promise<void> {
    if (running) {
      await running;
      if (pending.size) return flush();
      return;
    }
    if (!pending.size) return;
    const batch = new Map(pending);
    pending.clear();
    inFlight = batch;
    onStatus({ state: "saving" });
    running = run([...batch.values()])
      .then(() => {
        failures = 0;
        onStatus(pending.size ? { state: "saving" } : { state: "saved" });
      })
      .catch((err: { message?: string }) => {
        // put back anything that wasn't superseded meanwhile, then retry with backoff
        for (const [k, op] of batch) if (!pending.has(k)) pending.set(k, op);
        failures++;
        onStatus({ state: "error", message: err?.message ?? "Could not save to the cloud" });
        schedule(Math.min(30_000, 1000 * 2 ** failures));
      })
      .finally(() => {
        running = null;
        inFlight = new Map();
      });
    await running;
    if (pending.size && failures === 0) schedule(0);
  }

  return {
    name: "cloud",
    flush,
    isBusy(table, id) {
      const key = `${table === "projects" ? "p" : "a"}:${id}`;
      return pending.has(key) || inFlight.has(key);
    },
    dropProject(projectId) {
      for (const [k, op] of pending) {
        if (("projectId" in op && op.projectId === projectId) || (op.kind !== "upsertAsset" && op.kind !== "deleteAsset" && op.id === projectId)) {
          pending.delete(k);
        }
      }
    },
    onChange(event: ChangeEvent) {
      if (event.op === "deleteProject") {
        for (const [k, op] of pending) if ("projectId" in op && op.projectId === event.projectId) pending.delete(k);
        pending.delete(`p:${event.projectId}`);
        pending.set(`p:${event.projectId}`, { kind: "deleteProject", id: event.projectId });
      } else if (event.collection === "projects") {
        pending.set(
          `p:${event.op === "put" ? event.item.id : event.id}`,
          event.op === "put"
            ? { kind: "upsertProject", id: event.item.id, data: event.item as Record<string, unknown> }
            : { kind: "deleteProject", id: event.id }
        );
      } else if (event.op === "put" && event.projectId) {
        pending.set(`a:${event.item.id}`, {
          kind: "upsertAsset",
          id: event.item.id,
          projectId: event.projectId,
          collection: event.collection,
          data: event.item as Record<string, unknown>,
        });
      } else if (event.op === "delete") {
        pending.set(`a:${event.id}`, { kind: "deleteAsset", id: event.id });
      }
      schedule(event.op === "put" && event.collection !== "projects" ? 700 : 0);
    },
  };
}
