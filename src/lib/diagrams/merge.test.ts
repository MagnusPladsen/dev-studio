import { beforeEach, describe, expect, it } from "vitest";
import type { Diagram, DiagramNode } from "@/types";
import { applyRemoteChanges, replaceCache, storage } from "@/lib/storage";
import { followRemoteChange, rebaseOnStored } from "@/lib/sync/open-document";
import { AliasBook } from "../../../packages/mcp/src/canvas/aliases";
import { IdSequence } from "../../../packages/mcp/src/canvas/ids";
import { applyOps } from "../../../packages/mcp/src/canvas/ops";
import type { Op } from "../../../packages/mcp/src/canvas/op-schema";
import { mergeDiagram } from "./merge";

const PROJECT = "p1";

const node = (id: string, x: number, label = id): DiagramNode => ({ id, type: "state", x, y: 0, width: 160, height: 60, label });

function canvas(nodes: DiagramNode[], edges: Diagram["edges"] = [], updatedAt = "2026-11-04T10:00:00.000Z"): Diagram {
  return { id: "d1", projectId: PROJECT, name: "Flow", nodes, edges, tags: [], createdAt: updatedAt, updatedAt };
}

/** What Claude does through `edit_canvas`: the server's own ops on the canvas as it loaded it. */
function claudeEdits(diagram: Diagram, ops: Op[]): Diagram {
  const work = applyOps(PROJECT, diagram, ops, new AliasBook(), new IdSequence());
  return { ...work.diagram, updatedAt: "2026-11-04T10:00:05.000Z" };
}

const ADD_TABLES = [
  { op: "add", ref: "users", kind: "table", text: "users", columns: [{ name: "id", type: "uuid", pk: true }] },
  { op: "add", ref: "teams", kind: "table", text: "teams", columns: [{ name: "id", type: "uuid", pk: true }, { name: "user_id", type: "uuid", fk: true }] },
  { op: "connect", from: "teams.user_id", to: "users.id" },
] as Op[];

/** The canvas editor's steps: what it shows when the change arrives, then what it writes on its next save. */
function editorReceives(base: Diagram, onScreen: Diagram, hasLocalEdits: boolean) {
  const stored = storage.getById("diagrams", base.id, PROJECT)!;
  const shown = followRemoteChange(base, onScreen, stored, hasLocalEdits, mergeDiagram);
  const saved = rebaseOnStored(stored, shown.next, storage.getById("diagrams", base.id, PROJECT), mergeDiagram);
  return { shown, saved };
}

describe("an MCP edit arriving while the canvas is open", () => {
  const base = canvas([node("a", 0), node("b", 300)], [{ id: "e1", from: "a", to: "b", type: "arrow" }]);
  let theirs: Diagram;

  beforeEach(() => {
    replaceCache(new Map());
    storage.save("diagrams", base, PROJECT);
    theirs = claudeEdits(base, ADD_TABLES);
    applyRemoteChanges([{ op: "put", collection: "diagrams", projectId: PROJECT, item: theirs }]);
  });

  it("should show Claude's tables and line when the canvas has no unsaved edits", () => {
    const { shown } = editorReceives(base, base, false);
    expect(shown.kind).toBe("replace");
    expect(shown.next.nodes.filter((n) => n.type === "table").map((n) => n.label)).toEqual(["users", "teams"]);
    expect(shown.next.edges).toHaveLength(2);
  });

  it("should keep a local move made at the same time and Claude's new elements", () => {
    const moved = { ...base, nodes: base.nodes.map((n) => (n.id === "a" ? { ...n, x: 40, y: 25 } : n)) };
    const { shown, saved } = editorReceives(base, moved, true);
    expect(shown.kind).toBe("merge");
    expect(saved.nodes.find((n) => n.id === "a")).toMatchObject({ x: 40, y: 25 });
    expect(saved.nodes.map((n) => n.id)).toEqual(theirs.nodes.map((n) => n.id));
    expect(saved.edges.map((e) => e.id)).toEqual(theirs.edges.map((e) => e.id));
  });

  it("should not drop Claude's elements when a stale copy is saved after the change landed", () => {
    const nudged = { ...base, nodes: base.nodes.map((n) => (n.id === "b" ? { ...n, x: 320 } : n)) };
    const saved = rebaseOnStored(base, nudged, storage.getById("diagrams", base.id, PROJECT), mergeDiagram);
    expect(saved.nodes).toHaveLength(theirs.nodes.length);
    expect(saved.nodes.find((n) => n.id === "b")?.x).toBe(320);
  });
});

describe("mergeDiagram", () => {
  const base = canvas([node("a", 0), node("b", 300), node("c", 600)], [
    { id: "ab", from: "a", to: "b", type: "arrow" },
    { id: "bc", from: "b", to: "c", type: "arrow" },
  ]);

  it("should keep both sides' changes to different fields of one card", () => {
    const mine = { ...base, nodes: base.nodes.map((n) => (n.id === "a" ? { ...n, x: 50 } : n)) };
    const theirs = { ...base, nodes: base.nodes.map((n) => (n.id === "a" ? { ...n, label: "Start" } : n)) };
    expect(mergeDiagram(base, mine, theirs).nodes[0]).toMatchObject({ x: 50, label: "Start" });
  });

  it("should prefer the local value when both sides changed the same field", () => {
    const mine = { ...base, nodes: base.nodes.map((n) => (n.id === "a" ? { ...n, x: 50 } : n)) };
    const theirs = { ...base, nodes: base.nodes.map((n) => (n.id === "a" ? { ...n, x: 90 } : n)) };
    expect(mergeDiagram(base, mine, theirs).nodes[0].x).toBe(50);
  });

  it("should keep a card deleted elsewhere deleted even when it was moved here", () => {
    const mine = { ...base, nodes: base.nodes.map((n) => (n.id === "c" ? { ...n, x: 700 } : n)) };
    const theirs = { ...base, nodes: base.nodes.filter((n) => n.id !== "c"), edges: base.edges.filter((e) => e.id !== "bc") };
    expect(mergeDiagram(base, mine, theirs).nodes.map((n) => n.id)).toEqual(["a", "b"]);
  });

  it("should drop a line drawn here to a card deleted elsewhere", () => {
    const mine = { ...base, edges: [...base.edges, { id: "ca", from: "c", to: "a", type: "arrow" as const }] };
    const theirs = { ...base, nodes: base.nodes.filter((n) => n.id !== "c"), edges: base.edges.filter((e) => e.id !== "bc") };
    expect(mergeDiagram(base, mine, theirs).edges.map((e) => e.id)).toEqual(["ab"]);
  });

  it("should keep cards added on both sides", () => {
    const mine = { ...base, nodes: [...base.nodes, node("mine", 900)] };
    const theirs = { ...base, nodes: [...base.nodes, node("theirs", 1200)] };
    expect(mergeDiagram(base, mine, theirs).nodes.map((n) => n.id).sort()).toEqual(["a", "b", "c", "mine", "theirs"]);
  });

  it("should stamp the merge with the newer updatedAt", () => {
    const theirs = { ...base, name: "Renamed", updatedAt: "2026-11-04T11:00:00.000Z" };
    expect(mergeDiagram(base, base, theirs).updatedAt).toBe("2026-11-04T11:00:00.000Z");
  });
});

describe("rebaseOnStored", () => {
  const base = canvas([node("a", 0)]);

  it("should write the local version as it is when nothing changed elsewhere", () => {
    const mine = { ...base, name: "Mine" };
    expect(rebaseOnStored(base, mine, base, mergeDiagram)).toBe(mine);
  });

  it("should write the local version when the base is unknown", () => {
    const mine = { ...base, name: "Mine" };
    expect(rebaseOnStored(null, mine, { ...base, name: "Theirs" }, mergeDiagram)).toBe(mine);
  });

  it("should treat a stored copy that differs only in updatedAt as unchanged", () => {
    const mine = { ...base, name: "Mine" };
    expect(rebaseOnStored(base, mine, { ...mine, updatedAt: "2026-11-04T12:00:00.000Z" })).toBe(mine);
  });
});
