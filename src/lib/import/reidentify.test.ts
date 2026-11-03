import { describe, expect, it } from "vitest";
import { reidentify } from "./reidentify";

describe("reidentify", () => {
  const tree = {
    id: "tree",
    nodes: [
      { id: "a", nextId: "b", choices: [{ text: "go", targetId: "b" }] },
      { id: "b", label: "a", parentIds: ["a", "elsewhere"] },
    ],
    edges: [{ id: "e1", from: "a", to: "b" }],
    asset: { type: "sprite", id: "hero" },
    inside: { type: "diagram", id: "tree", elementId: "a" },
  };

  it("gives every object a new id and rewires references to them", () => {
    const { items, ids } = reidentify([tree], { refKeys: ["from", "to"] });
    const [copy] = items;
    const newId = (old: string) => ids.get(old)!;
    expect(copy.id).toBe(newId("tree"));
    expect(copy.nodes[0]).toEqual({ id: newId("a"), nextId: newId("b"), choices: [{ text: "go", targetId: newId("b") }] });
    expect(copy.nodes[1].parentIds).toEqual([newId("a"), "elsewhere"]);
    expect(copy.edges[0]).toEqual({ id: newId("e1"), from: newId("a"), to: newId("b") });
  });

  it("leaves text alone even when it matches an id", () => {
    const { items } = reidentify([tree]);
    expect(items[0].nodes[1].label).toBe("a");
  });

  it("keeps references to assets outside the file and rewires those pointing inside it", () => {
    const { items, ids } = reidentify([tree]);
    expect(items[0].asset).toEqual({ type: "sprite", id: "hero" });
    expect(items[0].inside).toEqual({ type: "diagram", id: ids.get("tree"), elementId: ids.get("a") });
    expect(ids.has("hero")).toBe(false);
  });

  it("does not change the input", () => {
    const before = JSON.stringify(tree);
    reidentify([tree]);
    expect(JSON.stringify(tree)).toBe(before);
  });
});
