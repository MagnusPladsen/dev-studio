import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Note } from "@/types";
import { addPersister, applyRemoteChanges, cacheKey, locateCached, replaceCache, storage, type ChangeEvent } from "./storage";
import { changesFromStorageEvent } from "./sync/tabs";

const note = (id: string, content = ""): Note => ({
  id,
  projectId: "p1",
  title: id,
  content,
  tags: [],
  createdAt: "2026-11-03T10:00:00.000Z",
  updatedAt: "2026-11-03T10:00:00.000Z",
});

beforeEach(() => {
  replaceCache(new Map([[cacheKey("projects"), [{ id: "p1" }]]]));
});

describe("applyRemoteChanges", () => {
  it("puts, updates and deletes items without sending them back to the primary persister", () => {
    const primary = { name: "cloud", onChange: vi.fn() };
    const mirror = { name: "folder", mirrorsRemote: true, onChange: vi.fn() };
    const detach = [addPersister(primary), addPersister(mirror)];

    applyRemoteChanges([{ op: "put", collection: "notes", projectId: "p1", item: note("n1") }]);
    expect(storage.getById("notes", "n1", "p1")).toMatchObject({ id: "n1" });
    applyRemoteChanges([{ op: "put", collection: "notes", projectId: "p1", item: note("n1", "edited") }]);
    expect(storage.getById("notes", "n1", "p1")).toMatchObject({ content: "edited" });
    applyRemoteChanges([{ op: "delete", collection: "notes", projectId: "p1", id: "n1" }]);
    expect(storage.getById("notes", "n1", "p1")).toBeUndefined();

    expect(primary.onChange).not.toHaveBeenCalled();
    expect(mirror.onChange).toHaveBeenCalledTimes(3);
    detach.forEach((d) => d());
  });

  it("skips changes that leave the cache as it is", () => {
    storage.save("notes", note("n1"), "p1");
    const listener = vi.fn();
    const unsubscribe = storage.onRemoteChange(listener);
    const version = storage.version();

    const applied = applyRemoteChanges([
      { op: "put", collection: "notes", projectId: "p1", item: note("n1") },
      { op: "delete", collection: "notes", projectId: "p1", id: "missing" },
    ]);

    expect(applied).toEqual([]);
    expect(storage.version()).toBe(version);
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("bumps only the changed collection's version and tells remote listeners what changed", () => {
    const listener = vi.fn();
    const unsubscribe = storage.onRemoteChange(listener);
    const notes = storage.versionOf("notes", "p1");
    const diagrams = storage.versionOf("diagrams", "p1");
    const change: ChangeEvent = { op: "put", collection: "notes", projectId: "p1", item: note("n2") };

    applyRemoteChanges([change]);

    expect(storage.versionOf("notes", "p1")).toBe(notes + 1);
    expect(storage.versionOf("diagrams", "p1")).toBe(diagrams);
    expect(listener).toHaveBeenCalledWith([change]);
    unsubscribe();
  });

  it("removes a project and all its data", () => {
    storage.save("notes", note("n1"), "p1");
    applyRemoteChanges([{ op: "deleteProject", projectId: "p1" }]);
    expect(storage.getAll("projects")).toEqual([]);
    expect(storage.getAll("notes", "p1")).toEqual([]);
  });

  it("finds where a cached asset lives from its id alone", () => {
    storage.save("diagrams", { id: "d1" } as never, "p1");
    expect(locateCached("d1")).toEqual({ collection: "diagrams", projectId: "p1" });
    expect(locateCached("nope")).toBeNull();
  });
});

describe("changesFromStorageEvent (guest tabs)", () => {
  it("turns another tab's write of a collection into puts and deletes", () => {
    storage.save("notes", note("keep"), "p1");
    storage.save("notes", note("gone"), "p1");
    const written = JSON.stringify([note("keep"), note("new")]);

    const changes = changesFromStorageEvent(cacheKey("notes", "p1"), written, new Map([[cacheKey("notes", "p1"), storage.getAll("notes", "p1")]]));

    expect(changes).toEqual([
      { op: "delete", collection: "notes", projectId: "p1", id: "gone" },
      { op: "put", collection: "notes", projectId: "p1", item: note("new") },
    ]);
  });

  it("reads a project missing from the projects key as a deleted project", () => {
    const cache = new Map([[cacheKey("projects"), [{ id: "p1" }, { id: "p2" }]]]);
    expect(changesFromStorageEvent(cacheKey("projects"), JSON.stringify([{ id: "p1" }]), cache)).toEqual([
      { op: "deleteProject", projectId: "p2" },
    ]);
  });

  it("ignores unrelated or corrupt keys", () => {
    expect(changesFromStorageEvent("theme", "dark", new Map())).toEqual([]);
    expect(changesFromStorageEvent(cacheKey("notes", "p1"), "{oops", new Map())).toEqual([]);
    expect(changesFromStorageEvent(null, null, new Map())).toEqual([]);
  });
});

describe("read-only projects", () => {
  it("refuses saves and deletes for them, tells listeners, and still takes remote changes", () => {
    storage.save("notes", note("n1"), "p1");
    const primary = { name: "cloud", onChange: vi.fn() };
    const refused = vi.fn();
    const detach = [addPersister(primary), storage.onRefused(refused)];
    storage.setReadOnly((projectId) => projectId === "p1");

    storage.save("notes", note("n1", "edited"), "p1");
    storage.delete("notes", "n1", "p1");
    storage.save("projects", { id: "p1", name: "Renamed" } as never);
    storage.deleteProject("p1");
    expect(storage.getById("notes", "n1", "p1")).toMatchObject({ content: "" });
    expect(storage.getAll("projects")).toEqual([{ id: "p1" }]);
    expect(primary.onChange).not.toHaveBeenCalled();
    expect(refused).toHaveBeenCalledTimes(4);
    expect(refused).toHaveBeenCalledWith("p1");

    applyRemoteChanges([{ op: "put", collection: "notes", projectId: "p1", item: note("n1", "from owner") }]);
    expect(storage.getById("notes", "n1", "p1")).toMatchObject({ content: "from owner" });

    storage.setReadOnly(() => false);
    detach.forEach((d) => d());
  });
});
