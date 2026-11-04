import { afterEach, describe, expect, it, vi } from "vitest";
import type { CollectionName } from "@/lib/storage";

const NOW = "2026-01-01T00:00:00.000Z";
const APPS = [
  ["GameDev Studio", undefined],
  ["Dev Studio", "dev-studio"],
] as const;

/** The art examples paint sprites on a canvas; a stand-in is enough here, since only the row shape is checked. */
const fakeContext = () => new Proxy({}, { get: () => () => undefined, set: () => true });
const fakeCanvas = () => ({ width: 0, height: 0, getContext: fakeContext, toDataURL: () => "data:image/png;base64," });

/** Loads a fresh copy of the app's modules as the given app, adds every example and returns all stored rows. */
async function exampleRows(appFlag: string | undefined): Promise<{ collection: CollectionName; row: unknown }[]> {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_APP", appFlag ?? "");
  vi.stubGlobal("document", { createElement: fakeCanvas });
  const { replaceCache, storage, PROJECT_COLLECTIONS } = await import("@/lib/storage");
  const { addExamples } = await import("@/lib/examples");
  replaceCache(new Map());
  storage.save("projects", { id: "p", name: "Pip's Quest", description: "", createdAt: NOW, updatedAt: NOW, ...(appFlag ? { app: appFlag } : {}) } as never);
  await addExamples("p");
  const rows: { collection: CollectionName; row: unknown }[] = [{ collection: "projects", row: storage.getById("projects", "p") }];
  for (const collection of PROJECT_COLLECTIONS) for (const row of storage.getAll(collection, "p")) rows.push({ collection, row });
  return rows;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe.each(APPS)("%s examples", (_, appFlag) => {
  it("every example row matches its collection's schema", async () => {
    const rows = await exampleRows(appFlag);
    const { validateRow } = await import("./index");
    const failures = rows.flatMap(({ collection, row }) => {
      const check = validateRow(collection, row);
      return check.ok ? [] : [`${collection} ${(row as { id: string }).id}: ${check.errors.join("; ")}`];
    });
    expect(failures).toEqual([]);
  });

  it("covers the collections the app's examples write", async () => {
    const rows = await exampleRows(appFlag);
    const collections = new Set(rows.map((r) => r.collection));
    const expected: CollectionName[] = appFlag
      ? ["projects", "diagrams", "stories", "notes", "boards", "issues", "decisions", "links"]
      : ["projects", "sprites", "sounds", "music", "diagrams", "stories", "tilemaps", "dialogues", "palettes", "spritesheets", "notes", "boards", "issues", "models", "decisions", "links"];
    expect([...collections].sort()).toEqual([...expected].sort());
  });
});

describe("schemas reject bad rows", () => {
  const issue = { id: "i", projectId: "p", key: "PIP-1", title: "T", description: "", type: "task", priority: "medium", status: "todo", sprintId: null, labels: [], order: 1000, tags: [], createdAt: NOW, updatedAt: NOW };
  const node = (id: string, type: string, data?: unknown) => ({ id, type, x: 0, y: 0, width: 100, height: 60, label: "", ...(data ? { data } : {}) });
  const diagram = (nodes: unknown[], edges: unknown[] = []) => ({ id: "d", projectId: "p", name: "D", nodes, edges, tags: [], createdAt: NOW, updatedAt: NOW });

  it("accepts a valid issue and keeps unknown fields", async () => {
    const { issueSchema } = await import("./index");
    expect(issueSchema.parse({ ...issue, futureField: 1 })).toMatchObject({ futureField: 1 });
  });

  it("rejects an unknown issue type and a malformed key", async () => {
    const { validateRow } = await import("./index");
    expect(validateRow("issues", { ...issue, type: "epic" }).ok).toBe(false);
    expect(validateRow("issues", { ...issue, key: "PIP" }).ok).toBe(false);
  });

  it("rejects a board with two active sprints or no Done column", async () => {
    const { validateRow, DEFAULT_COLUMNS } = { ...(await import("./index")), ...(await import("@/lib/board")) };
    const board = { id: "b", projectId: "p", name: "Task Board", keyPrefix: "PIP", nextNumber: 1, columns: DEFAULT_COLUMNS, sprints: [], createdAt: NOW, updatedAt: NOW };
    expect(validateRow("boards", board).ok).toBe(true);
    const active = (id: string) => ({ id, name: id, state: "active" });
    expect(validateRow("boards", { ...board, sprints: [active("a"), active("b")] }).ok).toBe(false);
    expect(validateRow("boards", { ...board, columns: DEFAULT_COLUMNS.filter((c) => c.category !== "done") }).ok).toBe(false);
  });

  it("rejects canvas lines to missing elements or table rows", async () => {
    const { validateRow } = await import("./index");
    const table = node("t", "table", { columns: [{ id: "c1", name: "id", type: "uuid", isPrimaryKey: true }] });
    expect(validateRow("diagrams", diagram([table, node("n", "note")], [{ id: "e", from: "t", to: "n", type: "line", fromRow: "c1" }])).ok).toBe(true);
    expect(validateRow("diagrams", diagram([table], [{ id: "e", from: "t", to: "gone", type: "arrow" }])).ok).toBe(false);
    expect(validateRow("diagrams", diagram([table, node("n", "note")], [{ id: "e", from: "t", to: "n", type: "line", fromRow: "c9" }])).ok).toBe(false);
  });

  it("rejects unknown node kinds, duplicate ids and unsafe links", async () => {
    const { validateRow } = await import("./index");
    expect(validateRow("diagrams", diagram([node("x", "hexagon")])).ok).toBe(false);
    expect(validateRow("diagrams", diagram([node("x", "note"), node("x", "note")])).ok).toBe(false);
    expect(validateRow("diagrams", diagram([node("l", "link", { url: "javascript:alert(1)" })])).ok).toBe(false);
    expect(validateRow("diagrams", diagram([node("l", "link", { url: "https://example.com" })])).ok).toBe(true);
  });

  it("checks link ends, including a canvas element", async () => {
    const { validateRow } = await import("./index");
    const link = { id: "l", projectId: "p", from: { type: "issue", id: "i" }, to: { type: "diagram", id: "d", elementId: "n1" }, createdAt: NOW, updatedAt: NOW };
    expect(validateRow("links", link).ok).toBe(true);
    expect(validateRow("links", { ...link, to: { type: "canvas", id: "d" } }).ok).toBe(false);
  });
});

describe("tilemap rows", () => {
  const tilemap = { id: "m", projectId: "p", name: "Map", width: 2, height: 1, tileSize: 16, layers: [{ id: "l", name: "Ground", visible: true, tiles: [[0, null]] }], tilesetSpriteIds: [], tags: [], createdAt: NOW, updatedAt: NOW };

  it("accepts old maps without terrains or collision, and new ones with them", async () => {
    const { validateRow } = await import("./index");
    expect(validateRow("tilemaps", tilemap).ok).toBe(true);
    expect(validateRow("tilemaps", { ...tilemap, terrains: [{ id: "t", name: "Rock", kind: "blob47", tiles: { 255: "s" } }], collision: [[1, 2]] }).ok).toBe(true);
    expect(validateRow("tilemaps", { ...tilemap, terrains: [{ id: "t", name: "Rock", kind: "hex", tiles: {} }] }).ok).toBe(false);
  });
});
