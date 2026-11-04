import type { SupabaseClient } from "@supabase/supabase-js";
import {
  cacheKey,
  getSnapshot,
  PROJECT_COLLECTIONS,
  parseCacheKey,
  type ChangeEvent,
  type Persister,
  type ProjectCollection,
  type Snapshot,
} from "../storage";
import { mergeBodies } from "./merge";
import { nextFreeIssueKey, nextFreeNumber } from "./renumber";

export type CloudTable = "projects" | "assets";
export type CloudRow = {
  id: string;
  user_id?: string;
  project_id?: string;
  collection?: string;
  data?: Record<string, unknown>;
  updated_at?: string;
  /** Server revision, bumped on every write; compare-and-swap writes send the one they last saw. */
  rev?: number;
};
/** A row the server confirmed writing (or deleting), with the server's `updated_at`. */
export type WrittenRow = { table: CloudTable; id: string; updatedAt?: string };
type UpsertProject = { kind: "upsertProject"; id: string; data: Record<string, unknown> };
type UpsertAsset = { kind: "upsertAsset"; id: string; projectId: string; collection: string; data: Record<string, unknown> };
type Upsert = UpsertProject | UpsertAsset;
type Op = Upsert | { kind: "deleteProject"; id: string } | { kind: "deleteAsset"; id: string };
/** One row's outcome from the save_projects / save_assets RPCs (see the rev migration). */
type SaveResult = {
  id: string;
  rev: number | null;
  updated_at: string | null;
  status: "ok" | "conflict" | "missing" | "duplicate" | "orphan";
};
/** The last version of a row we know the server holds: its rev, and its body as the base for merges. */
type Known = { rev: number; base?: Record<string, unknown> };

const PAGE = 500;
const ROW_COLUMNS: Record<CloudTable, string> = {
  projects: "id, data, updated_at, rev",
  assets: "id, project_id, collection, data, updated_at, rev",
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

export async function loadCloudSnapshot(
  supabase: SupabaseClient
): Promise<{ snapshot: Snapshot; cursor: string | null; rows: Record<CloudTable, CloudRow[]> }> {
  const [projects, assets] = await Promise.all([selectAll(supabase, "projects"), selectAll(supabase, "assets")]);
  return { snapshot: snapshotFromRows(projects, assets), cursor: newestUpdate([...projects, ...assets]), rows: { projects, assets } };
}

/** Cache contents for project and asset rows as the server holds them. */
export function snapshotFromRows(projects: CloudRow[], assets: CloudRow[]): Snapshot {
  const snap: Snapshot = new Map();
  snap.set(cacheKey("projects"), projects.map((r) => ({ ...r.data, id: r.id })));
  for (const a of assets) {
    if (!a.project_id || !(PROJECT_COLLECTIONS as string[]).includes(a.collection ?? "")) continue;
    const key = cacheKey(a.collection as (typeof PROJECT_COLLECTIONS)[number], a.project_id);
    const list = snap.get(key) ?? [];
    list.push({ ...a.data, id: a.id });
    snap.set(key, list);
  }
  return snap;
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
 *
 * Saves are compare-and-swap: each row goes out with the rev we last saw and is written only if the
 * server still holds it. On a conflict the server's copy is fetched and merged with ours
 * (`mergeBodies`), the merge goes into the cache through `applyLocally` and is saved again. A row
 * deleted elsewhere stays deleted; a taken issue key or ADR number moves to the next free one.
 */
export function createCloudPersister(
  supabase: SupabaseClient,
  userId: string,
  onStatus: (s: SyncStatus) => void,
  onWritten: (rows: WrittenRow[]) => void = () => {},
  applyLocally: (changes: ChangeEvent[]) => void = () => {}
): Persister & {
  flush(): Promise<void>;
  /** Whether a write for this row is queued or in flight (live updates hold off on it until it lands). */
  isBusy(table: CloudTable, id: string): boolean;
  /** Forget queued writes for a project that was deleted elsewhere. */
  dropProject(projectId: string): void;
  /** Rows as the server holds them (initial load, live updates): their rev is what the next save expects. */
  remember(table: CloudTable, rows: CloudRow[]): void;
  forget(table: CloudTable, id: string): void;
} {
  const pending = new Map<string, Op>();
  let inFlight = new Map<string, Op>();
  const known = new Map<string, Known>();
  const reader = createCloudReader(supabase);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running: Promise<void> | null = null;
  let failures = 0;

  const schedule = (delay = 700) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void flush(), delay);
  };
  const keyOf = (table: CloudTable, id: string) => `${table === "projects" ? "p" : "a"}:${id}`;
  const tableOf = (op: Op): CloudTable => (op.kind === "upsertProject" || op.kind === "deleteProject" ? "projects" : "assets");

  function remember(table: CloudTable, rows: CloudRow[]) {
    for (const row of rows) {
      if (typeof row.rev === "number") known.set(keyOf(table, row.id), { rev: row.rev, base: row.data });
    }
  }

  function saveRow(op: Upsert) {
    const rev = known.get(keyOf(tableOf(op), op.id))?.rev ?? null;
    const data = { ...op.data, id: op.id };
    return op.kind === "upsertProject"
      ? { id: op.id, name: String(op.data.name ?? ""), data, rev }
      : { id: op.id, project_id: op.projectId, collection: op.collection, data, rev };
  }

  /** The newest local version of a row: a later edit queued while this one was in flight wins. */
  function latest(op: Upsert): Upsert {
    const queued = pending.get(keyOf(tableOf(op), op.id));
    return queued?.kind === op.kind ? (queued as Upsert) : op;
  }

  function requeue(op: Upsert, data: Record<string, unknown>) {
    const key = keyOf(tableOf(op), op.id);
    const queued = pending.get(key);
    if (queued && queued.kind !== op.kind) return; // deleted locally meanwhile
    pending.set(key, { ...op, data });
    applyLocally([
      op.kind === "upsertProject"
        ? { op: "put", collection: "projects", item: { ...data, id: op.id } }
        : { op: "put", collection: op.collection as ProjectCollection, projectId: op.projectId, item: { ...data, id: op.id } },
    ]);
  }

  /** Deleted on the server since we last saw it: deletes win, so drop our edit and the cached copy. */
  function deletedElsewhere(op: Upsert) {
    const key = keyOf(tableOf(op), op.id);
    known.delete(key);
    if (pending.get(key)?.kind === op.kind) pending.delete(key);
    applyLocally([
      op.kind === "upsertProject"
        ? { op: "deleteProject", projectId: op.id }
        : { op: "delete", collection: op.collection as ProjectCollection, projectId: op.projectId, id: op.id },
    ]);
  }

  async function resolveConflicts(table: CloudTable, ops: Upsert[]) {
    if (!ops.length) return;
    const theirs = new Map((await reader.rows(table, ops.map((o) => o.id))).map((r) => [r.id, r]));
    for (const op of ops) {
      const row = theirs.get(op.id);
      if (!row?.data) {
        deletedElsewhere(op);
        continue;
      }
      const key = keyOf(table, op.id);
      const merged = mergeBodies(known.get(key)?.base, latest(op).data, row.data);
      known.set(key, { rev: row.rev ?? 0, base: row.data });
      requeue(op, { ...merged, id: op.id });
    }
  }

  async function takenValues(projectId: string, collection: string, field: string, exceptId: string): Promise<unknown[]> {
    const values: unknown[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from("assets")
        .select(`id, value:data->>${field}`)
        .eq("project_id", projectId)
        .eq("collection", collection)
        .order("id")
        .range(from, from + PAGE - 1);
      if (error) throw error;
      const rows = (data ?? []) as unknown as { id: string; value: unknown }[];
      values.push(...rows.filter((r) => r.id !== exceptId).map((r) => r.value));
      if (rows.length < PAGE) break;
    }
    const cached = (getSnapshot().get(cacheKey(collection as ProjectCollection, projectId)) ?? []) as Record<string, unknown>[];
    return [...values, ...cached.filter((i) => i.id !== exceptId).map((i) => i[field])];
  }

  async function renumberDuplicates(ops: UpsertAsset[]) {
    for (const op of ops) {
      const field = op.collection === "issues" ? "key" : op.collection === "decisions" ? "number" : null;
      if (!field) throw new Error(`Could not save ${op.id}: it clashes with another row`);
      const taken = await takenValues(op.projectId, op.collection, field, op.id);
      const data = latest(op).data;
      const value = field === "key" ? nextFreeIssueKey(String(data.key ?? ""), taken.map(String)) : nextFreeNumber(taken);
      requeue(op, { ...data, [field]: value, updatedAt: new Date().toISOString() });
    }
  }

  async function save(table: CloudTable, ops: Upsert[]) {
    for (let i = 0; i < ops.length; i += 100) {
      const chunk = new Map(ops.slice(i, i + 100).map((o) => [o.id, o]));
      const { data, error } = await supabase.rpc(table === "projects" ? "save_projects" : "save_assets", {
        p_rows: [...chunk.values()].map(saveRow),
      });
      if (error) throw error;
      const results = (data ?? []) as SaveResult[];
      const outcome = (status: SaveResult["status"]) =>
        results.filter((r) => r.status === status).flatMap((r) => chunk.get(r.id) ?? []);
      for (const r of results.filter((r) => r.status === "ok")) {
        known.set(keyOf(table, r.id), { rev: r.rev ?? 0, base: { ...chunk.get(r.id)?.data, id: r.id } });
      }
      for (const r of results.filter((r) => r.status === "orphan")) known.delete(keyOf(table, r.id));
      onWritten(results.filter((r) => r.status === "ok").map((r) => ({ table, id: r.id, updatedAt: r.updated_at ?? undefined })));
      outcome("missing").forEach(deletedElsewhere);
      await resolveConflicts(table, outcome("conflict"));
      await renumberDuplicates(outcome("duplicate") as UpsertAsset[]);
    }
  }

  async function remove(table: CloudTable, ids: string[]) {
    if (!ids.length) return;
    const { data, error } = await supabase.from(table).delete().eq("user_id", userId).in("id", ids).select("id, updated_at");
    if (error) throw error;
    for (const id of ids) known.delete(keyOf(table, id));
    onWritten(((data ?? []) as CloudRow[]).map((r) => ({ table, id: r.id, updatedAt: r.updated_at })));
  }

  async function run(ops: Op[]) {
    const order = { upsertProject: 0, upsertAsset: 1, deleteAsset: 2, deleteProject: 3 } as const;
    ops.sort((a, b) => order[a.kind] - order[b.kind]);
    const ofKind = <K extends Op["kind"]>(kind: K) => ops.filter((o): o is Extract<Op, { kind: K }> => o.kind === kind);

    await save("projects", ofKind("upsertProject"));
    await save("assets", ofKind("upsertAsset"));
    await remove("assets", ofKind("deleteAsset").map((o) => o.id));
    await remove("projects", ofKind("deleteProject").map((o) => o.id));
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
    remember,
    forget: (table, id) => known.delete(keyOf(table, id)),
    isBusy(table, id) {
      const key = keyOf(table, id);
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
