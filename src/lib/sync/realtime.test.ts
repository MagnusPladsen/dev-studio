import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChangeEvent } from "../storage";
import type { CloudReader, CloudRow, CloudTable } from "./cloud";
import { CATCH_UP_MARGIN_MS, connectRealtime, createRemoteSync, type RemoteSyncDeps } from "./realtime";

const USER = "u1";
const T = (s: number) => new Date(Date.UTC(2026, 10, 3, 10, 0, s)).toISOString();
const assetRow = (id: string, s: number, data: Record<string, unknown> = { title: id }): CloudRow => ({
  id,
  user_id: USER,
  project_id: "p1",
  collection: "notes",
  data,
  updated_at: T(s),
});

function setup(overrides: Partial<RemoteSyncDeps> = {}) {
  const applied: ChangeEvent[] = [];
  const busy = new Set<string>();
  const server: Record<CloudTable, CloudRow[]> = { projects: [], assets: [] };
  const reader: CloudReader = {
    changedSince: vi.fn(async (table: CloudTable) => server[table]),
    ids: vi.fn(async (table: CloudTable) => server[table].map((r) => r.id)),
    rows: vi.fn(async (table: CloudTable, ids: string[]) => server[table].filter((r) => ids.includes(r.id))),
  };
  let clock = 1_000;
  const sync = createRemoteSync({
    userId: USER,
    reader,
    cursor: T(0),
    apply: (changes) => applied.push(...changes),
    isBusy: (table, id) => busy.has(`${table}:${id}`),
    locate: (id) => (id.startsWith("n") ? { collection: "notes", projectId: "p1" } : null),
    cachedIds: () => ({ projects: [], assets: [] }),
    now: () => clock++,
    ...overrides,
  });
  return { sync, applied, busy, server, reader };
}

describe("applying remote changes", () => {
  it("applies inserts, updates and deletes of the user's rows", () => {
    const { sync, applied } = setup();
    sync.receive("assets", "upsert", assetRow("n1", 1));
    sync.receive("assets", "upsert", assetRow("n1", 2, { title: "renamed" }));
    sync.receive("assets", "delete", { id: "n1", user_id: USER });
    sync.receive("projects", "delete", { id: "p9", user_id: USER });

    expect(applied).toEqual([
      { op: "put", collection: "notes", projectId: "p1", item: { title: "n1", id: "n1" } },
      { op: "put", collection: "notes", projectId: "p1", item: { title: "renamed", id: "n1" } },
      { op: "delete", collection: "notes", projectId: "p1", id: "n1" },
      { op: "deleteProject", projectId: "p9" },
    ]);
  });

  it("ignores other users' rows and rows of unknown collections", () => {
    const { sync, applied } = setup();
    sync.receive("assets", "upsert", { ...assetRow("n1", 1), user_id: "someone-else" });
    sync.receive("assets", "upsert", { ...assetRow("n2", 1), collection: "secrets" });
    expect(applied).toEqual([]);
  });

  it("fetches rows that Realtime sent without their data (too large for one message)", async () => {
    const { sync, applied, server } = setup();
    server.assets = [assetRow("n1", 5, { title: "big" })];
    sync.receive("assets", "upsert", { ...assetRow("n1", 5), data: undefined });
    await vi.waitFor(() => expect(applied).toHaveLength(1));
    expect(applied[0]).toMatchObject({ op: "put", item: { title: "big" } });
  });
});

describe("echo suppression", () => {
  it("drops the echo of our own confirmed write", async () => {
    const { sync, applied } = setup();
    await sync.written([{ table: "assets", id: "n1", updatedAt: T(3) }]);
    sync.receive("assets", "upsert", assetRow("n1", 3));
    expect(applied).toEqual([]);
  });

  it("drops events older than a version we already know about", async () => {
    const { sync, applied } = setup();
    sync.receive("assets", "upsert", assetRow("n1", 4));
    sync.receive("assets", "upsert", assetRow("n1", 2));
    await sync.written([{ table: "assets", id: "n2", updatedAt: T(9) }]);
    sync.receive("assets", "upsert", assetRow("n2", 8));
    expect(applied).toHaveLength(1);
    expect(applied[0]).toMatchObject({ item: { id: "n1" } });
  });
});

describe("conflicts with pending writes", () => {
  it("parks a remote change while our write is queued, then re-reads the row once it lands", async () => {
    const { sync, applied, busy, server, reader } = setup();
    busy.add("assets:n1");
    sync.receive("assets", "upsert", assetRow("n1", 5, { title: "theirs" }));
    expect(applied).toEqual([]);

    // our write went out after theirs, so the server now holds ours
    server.assets = [assetRow("n1", 7, { title: "ours" })];
    busy.delete("assets:n1");
    await sync.written([{ table: "assets", id: "n1", updatedAt: T(7) }]);

    expect(reader.rows).toHaveBeenCalledWith("assets", ["n1"]);
    expect(applied).toEqual([]); // the server copy is our own write: nothing to apply
  });

  it("applies the remote copy when it landed after our write", async () => {
    const { sync, applied, busy, server } = setup();
    busy.add("assets:n1");
    sync.receive("assets", "upsert", assetRow("n1", 8, { title: "theirs" }));
    server.assets = [assetRow("n1", 8, { title: "theirs" })];
    busy.delete("assets:n1");
    await sync.written([{ table: "assets", id: "n1", updatedAt: T(6) }]);
    expect(applied).toEqual([{ op: "put", collection: "notes", projectId: "p1", item: { title: "theirs", id: "n1" } }]);
  });

  it("settles a remote delete that overlapped our write by asking the server", async () => {
    const { sync, applied, busy } = setup();
    busy.add("assets:n1");
    sync.receive("assets", "delete", { id: "n1", user_id: USER });
    busy.delete("assets:n1");
    await sync.written([{ table: "assets", id: "n1", updatedAt: T(4) }]);
    expect(applied).toEqual([{ op: "delete", collection: "notes", projectId: "p1", id: "n1" }]);
  });
});

describe("catch-up", () => {
  it("fetches rows changed since the last seen update, minus a safety margin", async () => {
    const { sync, applied, server, reader } = setup();
    server.assets = [assetRow("n1", 30)];
    await sync.catchUp();
    expect(reader.changedSince).toHaveBeenCalledWith("assets", new Date(Date.parse(T(0)) - CATCH_UP_MARGIN_MS).toISOString());
    expect(applied).toEqual([{ op: "put", collection: "notes", projectId: "p1", item: { title: "n1", id: "n1" } }]);

    await sync.catchUp();
    expect(reader.changedSince).toHaveBeenLastCalledWith("assets", new Date(Date.parse(T(30)) - CATCH_UP_MARGIN_MS).toISOString());
    expect(applied).toHaveLength(1); // the same row again is not news
  });

  it("deletes cached rows the server no longer has, but not ones with a write of ours pending", async () => {
    const { sync, applied, busy } = setup({ cachedIds: () => ({ projects: ["p-gone"], assets: ["n-gone", "n-mine"] }) });
    busy.add("assets:n-mine");
    await sync.catchUp();
    expect(applied).toEqual([
      { op: "deleteProject", projectId: "p-gone" },
      { op: "delete", collection: "notes", projectId: "p1", id: "n-gone" },
    ]);
  });

  it("runs one catch-up at a time", async () => {
    const { sync, reader } = setup();
    await Promise.all([sync.catchUp(), sync.catchUp()]);
    expect(reader.changedSince).toHaveBeenCalledTimes(2); // projects + assets, once
  });
});

describe("connectRealtime", () => {
  const documentEvents = new EventTarget();
  const windowEvents = new EventTarget();
  beforeEach(() => {
    vi.stubGlobal("document", Object.assign(documentEvents, { visibilityState: "visible" }));
    vi.stubGlobal("window", windowEvents);
  });
  afterEach(() => vi.unstubAllGlobals());

  function mockSupabase() {
    const handlers: Record<string, (payload: unknown) => void> = {};
    const filters: unknown[] = [];
    let onStatus: (status: string) => void = () => {};
    const channel = {
      on(_type: string, filter: { table: string }, handler: (payload: unknown) => void) {
        filters.push(filter);
        handlers[filter.table] = handler;
        return channel;
      },
      subscribe(callback: (status: string) => void) {
        onStatus = callback;
        return channel;
      },
    };
    const supabase = { channel: vi.fn(() => channel), removeChannel: vi.fn(async () => "ok") };
    return { supabase: supabase as unknown as SupabaseClient, raw: supabase, handlers, filters, status: (s: string) => onStatus(s) };
  }

  it("filters to the user, routes events and catches up on every (re)join and wake-up", () => {
    const mock = mockSupabase();
    const sync = { receive: vi.fn(), written: vi.fn(), catchUp: vi.fn(async () => {}) };
    const stop = connectRealtime(mock.supabase, sync, USER, vi.fn());

    expect(mock.filters).toEqual([
      { event: "*", schema: "public", table: "projects", filter: "user_id=eq.u1" },
      { event: "*", schema: "public", table: "assets", filter: "user_id=eq.u1" },
    ]);
    mock.handlers.assets({ eventType: "INSERT", new: assetRow("n1", 1), old: {} });
    mock.handlers.projects({ eventType: "DELETE", new: {}, old: { id: "p1", user_id: USER } });
    expect(sync.receive).toHaveBeenNthCalledWith(1, "assets", "upsert", assetRow("n1", 1));
    expect(sync.receive).toHaveBeenNthCalledWith(2, "projects", "delete", { id: "p1", user_id: USER });

    mock.status("SUBSCRIBED");
    mock.status("CHANNEL_ERROR");
    mock.status("SUBSCRIBED");
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("online"));
    expect(sync.catchUp).toHaveBeenCalledTimes(4);

    stop();
    document.dispatchEvent(new Event("visibilitychange"));
    expect(sync.catchUp).toHaveBeenCalledTimes(4);
    expect(mock.raw.removeChannel).toHaveBeenCalled();
  });
});
