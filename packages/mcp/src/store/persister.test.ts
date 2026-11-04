import { beforeEach, describe, expect, it } from "vitest";
import { createAwaitedPersister, WriteRefused } from "./persister";
import { FakeSupabase } from "../testing/fake-supabase";
import { P, seed } from "../testing/fixtures";

const NOW = "2026-11-04T10:00:00.000Z";
const link = (id: string) => ({ id, projectId: P, from: { type: "note", id: "note-1" }, to: { type: "issue", id: "issue-1" }, createdAt: NOW, updatedAt: NOW });

let db: FakeSupabase;
beforeEach(() => {
  db = new FakeSupabase();
  seed(db);
});

describe("the awaited persister", () => {
  it("sends inserts with rev null and updates with the rev it loaded", async () => {
    const persister = createAwaitedPersister(db.client);
    const page = db.assets.find((a) => a.id === "page-2")!;
    persister.remember("assets", [page]);
    persister.onChange({ op: "put", collection: "links", projectId: P, item: link("l1") }, new Map());
    persister.onChange({ op: "put", collection: "stories", projectId: P, item: { ...page.data, id: "page-2", content: "Weekly." } as { id: string } }, new Map());
    expect(await persister.flush()).toEqual({ written: 2 });
    const rows = db.calls[0].args.p_rows as { id: string; rev: number | null }[];
    expect(rows.map((r) => [r.id, r.rev])).toEqual([["l1", null], ["page-2", 1]]);
    expect(page.rev).toBe(2);
  });

  it("writes nothing when one body is invalid", async () => {
    const persister = createAwaitedPersister(db.client);
    persister.onChange({ op: "put", collection: "links", projectId: P, item: link("l1") }, new Map());
    persister.onChange({ op: "put", collection: "links", projectId: P, item: { id: "bad", updatedAt: NOW } }, new Map());
    await expect(persister.flush()).rejects.toBeInstanceOf(WriteRefused);
    expect(db.calls).toEqual([]);
  });

  it("never writes a name-only stand-in back", async () => {
    const persister = createAwaitedPersister(db.client);
    const sprite = db.assets.find((a) => a.id === "sprite-1")!;
    persister.remember("assets", [sprite], true);
    persister.onChange({ op: "put", collection: "sprites", projectId: P, item: { id: "sprite-1", name: "Hero 2", updatedAt: NOW } as { id: string } }, new Map());
    await expect(persister.flush()).rejects.toThrow(/name-only/);
  });

  it("refuses project deletes outright, writing nothing", async () => {
    const persister = createAwaitedPersister(db.client);
    persister.onChange({ op: "put", collection: "links", projectId: P, item: link("l1") }, new Map());
    persister.onChange({ op: "deleteProject", projectId: P }, new Map());
    await expect(persister.flush()).rejects.toThrow(/can't delete projects/);
    expect(db.calls).toEqual([]);
  });
});
