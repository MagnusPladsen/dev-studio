import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createCloudPersister } from "./cloud";

/** A Supabase stand-in whose writes resolve when the test says so, returning server timestamps. */
function mockSupabase() {
  const releases: (() => void)[] = [];
  const query = (rows: unknown) => {
    const result = new Promise((resolve) => releases.push(() => resolve({ data: rows, error: null })));
    const chain = { select: () => result, eq: () => chain, in: () => chain };
    return chain;
  };
  const supabase = {
    from: () => ({
      upsert: (rows: { id: string }[]) => query(rows.map((r) => ({ id: r.id, updated_at: "2026-11-03T10:00:05.000Z" }))),
      delete: () => query([]),
    }),
  };
  return { supabase: supabase as unknown as SupabaseClient, release: () => releases.shift()?.() };
}

describe("cloud persister and live updates", () => {
  it("reports a row as busy while its write is queued or in flight, and confirms it with the server time", async () => {
    vi.useFakeTimers();
    const { supabase, release } = mockSupabase();
    const onWritten = vi.fn();
    const persister = createCloudPersister(supabase, "u1", () => {}, onWritten);

    persister.onChange({ op: "put", collection: "notes", projectId: "p1", item: { id: "n1" } }, new Map());
    expect(persister.isBusy("assets", "n1")).toBe(true);
    expect(persister.isBusy("projects", "n1")).toBe(false);

    const flushing = persister.flush();
    expect(persister.isBusy("assets", "n1")).toBe(true); // in flight
    await vi.waitFor(() => release());
    await flushing;

    expect(persister.isBusy("assets", "n1")).toBe(false);
    expect(onWritten).toHaveBeenCalledWith([{ table: "assets", id: "n1", updatedAt: "2026-11-03T10:00:05.000Z" }]);
    vi.useRealTimers();
  });

  it("drops queued writes for a project deleted elsewhere", () => {
    vi.useFakeTimers();
    const persister = createCloudPersister(mockSupabase().supabase, "u1", () => {});
    persister.onChange({ op: "put", collection: "projects", item: { id: "p1" } }, new Map());
    persister.onChange({ op: "put", collection: "notes", projectId: "p1", item: { id: "n1" } }, new Map());
    persister.onChange({ op: "put", collection: "notes", projectId: "p2", item: { id: "n2" } }, new Map());

    persister.dropProject("p1");

    expect(persister.isBusy("projects", "p1")).toBe(false);
    expect(persister.isBusy("assets", "n1")).toBe(false);
    expect(persister.isBusy("assets", "n2")).toBe(true);
    vi.useRealTimers();
  });
});
