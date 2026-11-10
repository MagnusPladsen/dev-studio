import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChangeEvent } from "../storage";
import { createCloudPersister } from "./cloud";

type Row = { id: string; project_id?: string; collection?: string; data: Record<string, unknown>; rev: number; updated_at: string };
type SaveRow = { id: string; rev: number | null; data: Record<string, unknown>; project_id?: string; collection?: string };

/**
 * A Supabase stand-in with the save_projects / save_assets semantics of the rev migration: rows are
 * written only when the client's rev matches, issue keys are unique. Writes wait for `release()` when
 * `gated` is on, so tests can look at a write while it is in flight.
 */
function fakeServer({ gated = false } = {}) {
  const tables: Record<string, Map<string, Row>> = { projects: new Map(), assets: new Map() };
  const releases: (() => void)[] = [];
  const calls: { rpc: string; rows: SaveRow[] }[] = [];
  /** Rows this user may only read (a viewer's): saves come back "forbidden". */
  const readOnly = new Set<string>();
  const deletes: { table: string; filters: [string, unknown][] }[] = [];
  let clock = 0;
  const later = <T>(value: T) =>
    gated ? new Promise<T>((resolve) => releases.push(() => resolve(value))) : Promise.resolve(value);

  function saveOne(table: string, row: SaveRow) {
    const current = tables[table].get(row.id);
    if (readOnly.has(row.id)) return { id: row.id, rev: current?.rev ?? null, updated_at: null, status: "forbidden" };
    const keyTaken = (key: unknown) =>
      row.collection === "issues" &&
      [...tables.assets.values()].some((r) => r.id !== row.id && r.collection === "issues" && r.data.key === key);
    if (row.rev === null ? current : current?.rev !== row.rev) {
      return current ? { id: row.id, rev: current.rev, updated_at: current.updated_at, status: "conflict" } : { id: row.id, rev: null, updated_at: null, status: "missing" };
    }
    if (keyTaken(row.data.key)) return { id: row.id, rev: null, updated_at: null, status: "duplicate" };
    const updated_at = new Date(Date.UTC(2026, 10, 3, 10, 0, ++clock)).toISOString();
    const saved = { ...row, rev: (current?.rev ?? 0) + 1, updated_at };
    tables[table].set(row.id, saved);
    return { id: row.id, rev: saved.rev, updated_at, status: "ok" };
  }

  function select(table: string) {
    const filters: ((r: Row) => boolean)[] = [];
    const chain = {
      eq: (column: keyof Row, value: unknown) => (filters.push((r) => r[column] === value), chain),
      in: (column: keyof Row, values: unknown[]) => (filters.push((r) => values.includes(r[column])), chain),
      order: () => chain,
      range: () => chain,
      then: (resolve: (v: unknown) => void) => {
        const rows = [...tables[table].values()].filter((r) => filters.every((f) => f(r)));
        resolve({ data: rows.map((r) => ({ ...r, value: r.data.key })), error: null });
      },
    };
    return chain;
  }

  const supabase = {
    rpc: (name: string, { p_rows }: { p_rows: SaveRow[] }) => {
      calls.push({ rpc: name, rows: p_rows });
      const table = name === "save_projects" ? "projects" : "assets";
      return later({ data: p_rows.map((row) => saveOne(table, row)), error: null });
    },
    from: (table: string) => ({
      select: () => select(table),
      delete: () => {
        const filters: [string, unknown][] = [];
        deletes.push({ table, filters });
        const chain = {
          eq: (column: string, value: unknown) => (filters.push([column, value]), chain),
          in: (column: string, values: unknown[]) => (filters.push([column, values]), chain),
          select: () => later({ data: [], error: null }),
        };
        return chain;
      },
    }),
  };
  /** Another writer (a second tab, the MCP server) changes a row directly. */
  const writeElsewhere = (table: string, row: Omit<Row, "rev" | "updated_at">) => saveOne(table, { ...row, rev: tables[table].get(row.id)?.rev ?? null });
  return { supabase: supabase as unknown as SupabaseClient, tables, calls, readOnly, deletes, writeElsewhere, release() {
      const next = releases.shift();
      if (!next) throw new Error("no write in flight yet");
      next();
    },
  };
}

const put = (collection: "notes" | "diagrams" | "issues", item: { id: string; [field: string]: unknown }): ChangeEvent => ({
  op: "put",
  collection,
  projectId: "p1",
  item,
});
const note = (id: string, data: Record<string, unknown>) => put("notes", { id, ...data });

describe("cloud persister and live updates", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("reports a row as busy while its write is queued or in flight, and confirms it with the server time", async () => {
    const { supabase, release } = fakeServer({ gated: true });
    const onWritten = vi.fn();
    const persister = createCloudPersister(supabase, "u1", () => {}, onWritten);

    persister.onChange(note("n1", {}), new Map());
    expect(persister.isBusy("assets", "n1")).toBe(true);
    expect(persister.isBusy("projects", "n1")).toBe(false);

    const flushing = persister.flush();
    expect(persister.isBusy("assets", "n1")).toBe(true); // in flight
    await vi.waitFor(() => release());
    await flushing;

    expect(persister.isBusy("assets", "n1")).toBe(false);
    expect(onWritten).toHaveBeenCalledWith([{ table: "assets", id: "n1", updatedAt: "2026-11-03T10:00:01.000Z" }]);
  });

  it("drops queued writes for a project deleted elsewhere", () => {
    const persister = createCloudPersister(fakeServer().supabase, "u1", () => {});
    persister.onChange({ op: "put", collection: "projects", item: { id: "p1" } }, new Map());
    persister.onChange(note("n1", {}), new Map());
    persister.onChange({ op: "put", collection: "notes", projectId: "p2", item: { id: "n2" } }, new Map());

    persister.dropProject("p1");

    expect(persister.isBusy("projects", "p1")).toBe(false);
    expect(persister.isBusy("assets", "n1")).toBe(false);
    expect(persister.isBusy("assets", "n2")).toBe(true);
  });
});

describe("compare-and-swap saves", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("sends no rev for a new row, then the rev the server returned", async () => {
    const server = fakeServer();
    const persister = createCloudPersister(server.supabase, "u1", () => {});

    persister.onChange(note("n1", { title: "One" }), new Map());
    await persister.flush();
    persister.onChange(note("n1", { title: "Two" }), new Map());
    await persister.flush();

    expect(server.calls.map((c) => c.rows[0].rev)).toEqual([null, 1]);
    expect(server.tables.assets.get("n1")).toMatchObject({ rev: 2, data: { title: "Two" } });
  });

  it("sends the rev of rows it was told about (initial load, live updates)", async () => {
    const server = fakeServer();
    server.writeElsewhere("assets", { id: "n1", project_id: "p1", collection: "notes", data: { id: "n1", title: "Loaded" } });
    const persister = createCloudPersister(server.supabase, "u1", () => {});
    persister.remember("assets", [{ id: "n1", rev: 1, data: { id: "n1", title: "Loaded" } }]);

    persister.onChange(note("n1", { title: "Edited" }), new Map());
    await persister.flush();

    expect(server.calls[0].rows[0].rev).toBe(1);
    expect(server.tables.assets.get("n1")?.data.title).toBe("Edited");
  });

  it("on a conflict, merges with the server's copy instead of overwriting it, and shows the merge locally", async () => {
    const server = fakeServer();
    const applied: ChangeEvent[] = [];
    const persister = createCloudPersister(server.supabase, "u1", () => {}, () => {}, (changes) => applied.push(...changes));
    const base = { id: "c1", name: "Map", nodes: [{ id: "a", label: "A" }] };
    server.writeElsewhere("assets", { id: "c1", project_id: "p1", collection: "diagrams", data: base });
    persister.remember("assets", [{ id: "c1", rev: 1, data: base }]);

    // Claude adds a table while the open canvas renames the map
    server.writeElsewhere("assets", { id: "c1", project_id: "p1", collection: "diagrams", data: { ...base, nodes: [...base.nodes, { id: "t", label: "users" }] } });
    persister.onChange(put("diagrams", { ...base, name: "World map" }), new Map());
    await persister.flush();
    await vi.runAllTimersAsync();

    const expected = { id: "c1", name: "World map", nodes: [{ id: "a", label: "A" }, { id: "t", label: "users" }] };
    expect(server.tables.assets.get("c1")).toMatchObject({ rev: 3, data: expected });
    expect(applied).toEqual([{ op: "put", collection: "diagrams", projectId: "p1", item: expected }]);
    expect(server.calls.map((c) => c.rows[0].rev)).toEqual([1, 2]);
  });

  it("merges the newest local edit when another one was queued while the conflicting write was in flight", async () => {
    const server = fakeServer({ gated: true });
    const persister = createCloudPersister(server.supabase, "u1", () => {});
    persister.remember("assets", [{ id: "n1", rev: 1, data: { id: "n1", title: "T", content: "a" } }]);
    server.tables.assets.set("n1", { id: "n1", project_id: "p1", collection: "notes", rev: 2, updated_at: "x", data: { id: "n1", title: "T", content: "a\nfrom Claude" } });

    persister.onChange(note("n1", { title: "T2", content: "a" }), new Map());
    const flushing = persister.flush();
    persister.onChange(note("n1", { title: "T3", content: "a" }), new Map());
    await vi.waitFor(() => release(server));
    await flushing;
    const second = persister.flush();
    await vi.waitFor(() => release(server));
    await second;

    expect(server.tables.assets.get("n1")?.data).toEqual({ id: "n1", title: "T3", content: "a\nfrom Claude" });
  });

  it("drops the edit of a row deleted elsewhere, and removes it locally", async () => {
    const server = fakeServer();
    const applied: ChangeEvent[] = [];
    const persister = createCloudPersister(server.supabase, "u1", () => {}, () => {}, (changes) => applied.push(...changes));
    persister.remember("assets", [{ id: "n1", rev: 4, data: { id: "n1" } }]);

    persister.onChange(note("n1", { title: "too late" }), new Map());
    await persister.flush();

    expect(server.tables.assets.has("n1")).toBe(false);
    expect(applied).toEqual([{ op: "delete", collection: "notes", projectId: "p1", id: "n1" }]);
    expect(persister.isBusy("assets", "n1")).toBe(false);
  });

  it("moves an issue to the next free key when another writer took it first", async () => {
    const server = fakeServer();
    const applied: ChangeEvent[] = [];
    const persister = createCloudPersister(server.supabase, "u1", () => {}, () => {}, (changes) => applied.push(...changes));
    server.writeElsewhere("assets", { id: "i1", project_id: "p1", collection: "issues", data: { id: "i1", key: "TIDE-4" } });

    persister.onChange(put("issues", { id: "i2", key: "TIDE-4", title: "Mine" }), new Map());
    await persister.flush();
    await vi.runAllTimersAsync();

    expect(server.tables.assets.get("i2")?.data).toMatchObject({ key: "TIDE-5", title: "Mine" });
    expect(applied[0]).toMatchObject({ op: "put", collection: "issues", item: { id: "i2", key: "TIDE-5" } });
  });

  it("forgets a row's rev once it is deleted", async () => {
    const server = fakeServer();
    const persister = createCloudPersister(server.supabase, "u1", () => {});
    persister.remember("assets", [{ id: "n1", rev: 3, data: { id: "n1" } }]);
    persister.forget("assets", "n1");

    persister.onChange(note("n1", { title: "again" }), new Map());
    await persister.flush();

    expect(server.calls[0].rows[0].rev).toBeNull();
  });
});

describe("shared projects", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  const viewerOfP1 = { canWrite: (projectId: string) => projectId !== "p1", ownerOf: (projectId: string) => (projectId === "p1" ? "owner" : "u1") };

  it("never sends a viewer's edits", async () => {
    const server = fakeServer();
    const persister = createCloudPersister(server.supabase, "u1", () => {}, () => {}, () => {}, viewerOfP1);

    persister.onChange(note("n1", { title: "mine?" }), new Map());
    persister.onChange({ op: "put", collection: "projects", item: { id: "p1" } }, new Map());
    persister.onChange({ op: "put", collection: "notes", projectId: "p2", item: { id: "n2" } }, new Map());
    await persister.flush();

    expect(server.calls.flatMap((c) => c.rows.map((r) => r.id))).toEqual(["n2"]);
  });

  it("puts the server's copy back when a save is refused", async () => {
    const server = fakeServer();
    const applied: ChangeEvent[] = [];
    const statuses: string[] = [];
    const persister = createCloudPersister(server.supabase, "u1", (s) => statuses.push(s.state), () => {}, (c) => applied.push(...c));
    server.writeElsewhere("assets", { id: "n1", project_id: "p1", collection: "notes", data: { id: "n1", title: "Theirs" } });
    persister.remember("assets", [{ id: "n1", rev: 1, data: { id: "n1", title: "Theirs" } }]);
    server.readOnly.add("n1");

    persister.onChange(note("n1", { title: "Mine" }), new Map());
    await persister.flush();
    await vi.runAllTimersAsync();

    expect(server.calls).toHaveLength(1);
    expect(applied).toEqual([{ op: "put", collection: "notes", projectId: "p1", item: { id: "n1", title: "Theirs" } }]);
    expect(statuses).toContain("error");
    expect(persister.isBusy("assets", "n1")).toBe(false);
  });

  it("deletes a shared project's assets under its owner", async () => {
    const server = fakeServer();
    const persister = createCloudPersister(server.supabase, "u1", () => {}, () => {}, () => {}, {
      canWrite: () => true,
      ownerOf: (projectId) => (projectId === "p1" ? "owner" : "u1"),
    });

    persister.onChange({ op: "delete", collection: "notes", projectId: "p1", id: "n1" }, new Map());
    persister.onChange({ op: "delete", collection: "notes", projectId: "p2", id: "n2" }, new Map());
    await persister.flush();

    expect(server.deletes.map((d) => d.filters)).toEqual([
      [["user_id", "owner"], ["id", ["n1"]]],
      [["user_id", "u1"], ["id", ["n2"]]],
    ]);
  });
});

function release(server: ReturnType<typeof fakeServer>) {
  server.release();
}
