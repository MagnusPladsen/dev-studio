import { describe, expect, it } from "vitest";
import type { DiagramEdge, DiagramNode } from "@/types";
import { cloneCards, copyCards, parseCards, serializeCards } from "./clipboard";

const node = (id: string, x = 0): DiagramNode => ({ id, type: "note", x, y: 0, width: 10, height: 10, label: id });
const edge = (id: string, from: string, to: string): DiagramEdge => ({ id, from, to, type: "arrow" });
const diagram = { nodes: [node("a"), node("b"), node("c")], edges: [edge("ab", "a", "b"), edge("bc", "b", "c")] };

describe("copyCards", () => {
  it("should keep only lines when both ends are copied", () => {
    const copied = copyCards(diagram, ["a", "b"]);
    expect(copied.nodes.map((n) => n.id)).toEqual(["a", "b"]);
    expect(copied.edges.map((e) => e.id)).toEqual(["ab"]);
  });
});

describe("parseCards", () => {
  it("should read cards back when the text was serialised by serializeCards", () => {
    const copied = copyCards(diagram, ["a", "b"]);
    expect(parseCards(serializeCards(copied))).toEqual(copied);
  });

  it("should return null when the clipboard holds plain text", () => {
    expect(parseCards("https://example.com")).toBeNull();
  });

  it("should return null when the JSON is broken", () => {
    expect(parseCards('{"type":"gamedev-studio/diagram-cards", nodes:')).toBeNull();
  });

  it("should drop nodes when they lack a position", () => {
    const text = JSON.stringify({ type: "gamedev-studio/diagram-cards", nodes: [node("a"), { id: "x", type: "note" }], edges: [] });
    expect(parseCards(text)?.nodes.map((n) => n.id)).toEqual(["a"]);
  });
});

describe("cloneCards", () => {
  let next = 0;
  const makeId = () => `new${++next}`;

  it("should give fresh ids and move the copies when pasted", () => {
    const pasted = cloneCards(copyCards(diagram, ["a"]), { x: 20, y: 30 }, makeId);
    expect(pasted.nodes[0]).toMatchObject({ x: 20, y: 30, label: "a" });
    expect(pasted.nodes[0].id).not.toBe("a");
  });

  it("should rewire copied lines to the new cards when both ends are pasted", () => {
    const pasted = cloneCards(copyCards(diagram, ["a", "b"]), { x: 0, y: 0 }, makeId);
    const [a, b] = pasted.nodes;
    expect(pasted.edges).toEqual([expect.objectContaining({ from: a.id, to: b.id })]);
    expect(pasted.edges[0].id).not.toBe("ab");
  });
});
