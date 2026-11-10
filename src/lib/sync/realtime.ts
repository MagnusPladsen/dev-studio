import type { RealtimePostgresChangesPayload, SupabaseClient } from "@supabase/supabase-js";
import { PROJECT_COLLECTIONS, type ChangeEvent, type ProjectCollection } from "../storage";
import type { CloudReader, CloudRow, CloudTable, WrittenRow } from "./cloud";

/**
 * Live updates for signed-in users.
 *
 * Changes to the user's rows arrive over Supabase Realtime (and, after a reconnect or a tab wake-up,
 * from a catch-up query) and go into the cache through `apply`. The rules:
 * - Echo: a row with a write of ours queued or in flight is not applied; it is parked and re-read
 *   from the server once our write lands. Events no newer than the server time of the last version
 *   we know about (our own confirmed write, or an event already applied) are dropped, which also drops
 *   the echo of our own writes.
 * - Conflicts: last writer wins by the server's `updated_at`. A local edit that hasn't been sent yet
 *   always goes out and wins, because it is written after the remote change it overlapped.
 */

/** Look back this far before the newest change seen, so a write that committed late is not missed. */
export const CATCH_UP_MARGIN_MS = 60_000;

export interface RemoteSyncDeps {
  userId: string;
  reader: CloudReader;
  apply(changes: ChangeEvent[]): void;
  isBusy(table: CloudTable, id: string): boolean;
  /** Where a cached asset lives, for deletes that only carry an id. */
  locate(id: string): { collection: ProjectCollection; projectId: string } | null;
  /** Ids currently cached, to notice rows deleted while we were offline. */
  cachedIds(): Record<CloudTable, string[]>;
  /** The newest `updated_at` the initial load saw. */
  cursor: string | null;
  /** Accounts whose rows we may see: our own and the owners of projects shared with us. */
  owners?(): string[];
  /** Runs first on every catch-up (refreshes which projects are shared with us). */
  beforeCatchUp?(): Promise<void>;
  /** A server version of a row was applied (or a row deleted), so the next save expects its rev. */
  onServerRow?(table: CloudTable, kind: "upsert" | "delete", row: CloudRow): void;
  now?: () => number;
}

export interface RemoteSync {
  receive(table: CloudTable, kind: "upsert" | "delete", row: CloudRow): void;
  /** Our own writes the server confirmed. Re-reads rows whose remote changes were parked meanwhile. */
  written(rows: WrittenRow[]): Promise<void>;
  catchUp(): Promise<void>;
}

const keyOf = (table: CloudTable, id: string) => `${table}:${id}`;
const timeOf = (row: { updated_at?: string; updatedAt?: string }) => Date.parse(row.updated_at ?? row.updatedAt ?? "") || 0;

export function createRemoteSync(deps: RemoteSyncDeps): RemoteSync {
  const now = deps.now ?? Date.now;
  /** Server time of the newest version we know the server holds, per row. */
  const seen = new Map<string, number>();
  /** When (local clock) we last heard of a row, so a catch-up started earlier doesn't undo it. */
  const touched = new Map<string, number>();
  /** Rows whose remote change arrived while a write of ours was pending: re-read after it lands. */
  const parked = new Map<string, CloudTable>();
  let cursor = Date.parse(deps.cursor ?? "") || 0;
  let catchingUp: Promise<void> | null = null;

  function toChange(table: CloudTable, kind: "upsert" | "delete", row: CloudRow): ChangeEvent | null {
    if (table === "projects") {
      if (kind === "delete") return { op: "deleteProject", projectId: row.id };
      return { op: "put", collection: "projects", item: { ...row.data, id: row.id } };
    }
    if (kind === "delete") {
      const where = deps.locate(row.id);
      return where ? { op: "delete", ...where, id: row.id } : null;
    }
    if (!row.project_id || !(PROJECT_COLLECTIONS as string[]).includes(row.collection ?? "")) return null;
    return { op: "put", collection: row.collection as ProjectCollection, projectId: row.project_id, item: { ...row.data, id: row.id } };
  }

  function receive(table: CloudTable, kind: "upsert" | "delete", row: CloudRow) {
    if (row.user_id && !(deps.owners?.() ?? [deps.userId]).includes(row.user_id)) return;
    const key = keyOf(table, row.id);
    const time = timeOf(row);
    cursor = Math.max(cursor, time);
    touched.set(key, now());
    // Realtime leaves out `data` when a row is too large for one message; fetch it instead.
    if (deps.isBusy(table, row.id) || (kind === "upsert" && !row.data)) {
      parked.set(key, table);
      if (!deps.isBusy(table, row.id)) void resolveParked();
      return;
    }
    if (time && time <= (seen.get(key) ?? 0)) return;
    if (time) seen.set(key, time);
    deps.onServerRow?.(table, kind, row);
    const change = toChange(table, kind, row);
    if (change) deps.apply([change]);
  }

  /** Re-read parked rows from the server, the source of truth once our own writes have landed. */
  async function resolveParked() {
    const ready = [...parked].filter(([key, table]) => !deps.isBusy(table, key.slice(table.length + 1)));
    if (!ready.length) return;
    for (const [key] of ready) parked.delete(key);
    for (const table of ["projects", "assets"] as const) {
      const ids = ready.filter(([, t]) => t === table).map(([key]) => key.slice(table.length + 1));
      if (!ids.length) continue;
      const rows = await deps.reader.rows(table, ids);
      const found = new Set(rows.map((r) => r.id));
      for (const row of rows) receive(table, "upsert", row);
      for (const id of ids) if (!found.has(id)) receive(table, "delete", { id });
    }
  }

  async function written(rows: WrittenRow[]) {
    for (const row of rows) {
      const key = keyOf(row.table, row.id);
      const time = timeOf(row);
      if (time) seen.set(key, Math.max(seen.get(key) ?? 0, time));
      cursor = Math.max(cursor, time);
      touched.set(key, now());
    }
    await resolveParked();
  }

  async function runCatchUp() {
    const startedAt = now();
    await deps.beforeCatchUp?.();
    const since = new Date(Math.max(0, cursor - CATCH_UP_MARGIN_MS)).toISOString();
    for (const table of ["projects", "assets"] as const) {
      for (const row of await deps.reader.changedSince(table, since)) receive(table, "upsert", row);
    }
    // Rows deleted while we weren't listening: cached here, gone on the server, and not touched since we asked.
    const cached = deps.cachedIds();
    for (const table of ["projects", "assets"] as const) {
      const onServer = new Set(await deps.reader.ids(table));
      for (const id of cached[table]) {
        if (onServer.has(id) || (touched.get(keyOf(table, id)) ?? 0) >= startedAt) continue;
        receive(table, "delete", { id });
      }
    }
  }

  return {
    receive,
    written,
    catchUp() {
      catchingUp ??= runCatchUp().finally(() => {
        catchingUp = null;
      });
      return catchingUp;
    },
  };
}

type RowPayload = RealtimePostgresChangesPayload<CloudRow>;
/** Each connection gets its own channel name: a reconnect for a new set of owners must not reuse one being removed. */
let channels = 0;

/**
 * Subscribes to the rows of the given owners (the user and whoever shared a project with them) and catches up whenever the channel (re)joins, the tab becomes
 * visible again or the network comes back. Realtime applies the tables' RLS policies to inserts and
 * updates; the user_id filter also narrows deletes, which RLS can't check. `onSharingChange` hears the
 * user's sharing events (someone joined, left, was removed or got a new role). Returns the unsubscribe.
 */
export function connectRealtime(
  supabase: SupabaseClient,
  sync: RemoteSync,
  userId: string,
  owners: string[],
  onError: (message: string) => void,
  onSharingChange?: () => void
): () => void {
  const catchUp = () => {
    sync.catchUp().catch((err: Error) => onError(`Could not fetch the latest changes: ${err.message}`));
  };
  const handle = (table: CloudTable) => (payload: RowPayload) => {
    if (payload.eventType === "DELETE") sync.receive(table, "delete", payload.old as CloudRow);
    else sync.receive(table, "upsert", payload.new);
  };
  const filter = owners.length > 1 ? `user_id=in.(${owners.join(",")})` : `user_id=eq.${userId}`;
  const channel = supabase
    .channel(`live:${userId}:${++channels}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "projects", filter }, handle("projects"))
    .on("postgres_changes", { event: "*", schema: "public", table: "assets", filter }, handle("assets"));
  channel.subscribe((status) => {
      // supabase-js rejoins on its own after errors and dropped sockets; each (re)join catches up.
      if (status === "SUBSCRIBED") catchUp();
    });

  // Its own channel: before the sharing_events migration is live, only this one fails, not the row updates.
  const sharing = onSharingChange
    ? supabase
        .channel(`sharing:${userId}:${channels}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "sharing_events", filter: `user_id=eq.${userId}` }, () => onSharingChange())
        .subscribe()
    : null;

  const onWake = () => {
    if (document.visibilityState === "visible") catchUp();
  };
  document.addEventListener("visibilitychange", onWake);
  window.addEventListener("online", catchUp);
  return () => {
    document.removeEventListener("visibilitychange", onWake);
    window.removeEventListener("online", catchUp);
    void supabase.removeChannel(channel);
    if (sharing) void supabase.removeChannel(sharing);
  };
}
