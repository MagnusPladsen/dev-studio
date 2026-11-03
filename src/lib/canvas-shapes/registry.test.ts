import { describe, expect, it } from "vitest";
import type { DiagramNode } from "@/types";
import type { NodeType } from "@/lib/diagrams/cards";
import { getShape, outlineOf, shapeColor, SHAPE_LIST, SHAPES, shapesInSection } from "./index";
import { createNode, insertNode } from "./create";

/** Sizes saved canvases were made with; changing one would move cards on boards people already have. */
const SAVED_SIZES: Record<NodeType, [number, number]> = {
  state: [140, 56],
  action: [140, 56],
  condition: [140, 56],
  event: [140, 56],
  note: [220, 96],
  custom: [140, 56],
  checklist: [240, 120],
  image: [260, 180],
  link: [280, 96],
  asset: [220, 64],
  group: [420, 320],
  rectangle: [160, 100],
  ellipse: [160, 100],
  diamond: [160, 110],
  drawing: [100, 100],
};

const node = (extra: Partial<DiagramNode>): DiagramNode => ({ id: "n", type: "note", x: 0, y: 0, width: 200, height: 80, label: "", ...extra });
const noAssets = { describeAsset: () => null };

describe("shape registry", () => {
  it("should define every card type exactly once", () => {
    const types = SHAPE_LIST.map((shape) => shape.type);
    expect(new Set(types).size).toBe(types.length);
    expect(types.sort()).toEqual(Object.keys(SAVED_SIZES).sort());
  });

  it("should keep the default sizes saved canvases were made with", () => {
    for (const [type, [width, height]] of Object.entries(SAVED_SIZES)) {
      expect(SHAPES[type as NodeType].size).toEqual({ width, height });
    }
  });

  it("should fall back to a note when a saved card has an unknown type", () => {
    expect(getShape("hologram").type).toBe("note");
  });

  it("should list the Add menu sections in their usual order", () => {
    expect(shapesInSection("board").map((s) => s.type)).toEqual(["note", "checklist", "image", "link", "asset", "group"]);
    expect(shapesInSection("shapes").map((s) => s.type)).toEqual(["rectangle", "ellipse", "diamond"]);
    expect(shapesInSection("flow").map((s) => s.type)).toEqual(["state", "action", "condition", "event"]);
  });

  it("should give every shape body an outline", () => {
    for (const shape of SHAPE_LIST.filter((s) => s.body === "shape")) expect(shape.outline).toBeTypeOf("function");
  });

  it("should keep groups behind other cards and let them carry their contents", () => {
    expect(SHAPE_LIST.filter((s) => s.layer === "back").map((s) => s.type)).toEqual(["group"]);
    expect(SHAPE_LIST.filter((s) => s.isContainer).map((s) => s.type)).toEqual(["group"]);
  });

  it("should only let drawings shrink below the usual minimum", () => {
    expect(SHAPES.drawing.minSize).toEqual({ width: 8, height: 8 });
    expect(SHAPES.group.minSize).toEqual({ width: 160, height: 40 });
    expect(SHAPES.note.minSize).toEqual({ width: 80, height: 40 });
  });

  it("should export every card type to SVG without throwing", () => {
    for (const shape of SHAPE_LIST) {
      const card = node({ type: shape.type, label: "Hello", data: { points: [0, 0, 10, 10] } });
      expect(typeof shape.toSvg(card, card, noAssets)).toBe("string");
    }
  });

  it("should use the card's own colour over its kind's default", () => {
    expect(shapeColor(node({ type: "state" }))).toBe("#60a5fa");
    expect(shapeColor(node({ type: "state", color: "#f87171" }))).toBe("#f87171");
  });

  it("should round the corners of a rectangle shape", () => {
    expect(outlineOf("rectangle", { x: 0, y: 0, width: 100, height: 60 })).toMatchObject({ kind: "rect", radius: 8 });
  });
});

describe("createNode", () => {
  it("should centre the card on the point with its kind's size and label", () => {
    expect(createNode("condition", { x: 100, y: 100 }, { id: "a" })).toEqual({
      id: "a",
      type: "condition",
      label: "Condition",
      x: 30,
      y: 72,
      width: 140,
      height: 56,
    });
  });

  it("should take a given width but keep the default height", () => {
    const card = createNode("image", { x: 0, y: 0 }, { id: "a", extra: { width: 200, height: 999, data: { src: "x" } } });
    expect(card).toMatchObject({ width: 200, height: 180, x: -100, data: { src: "x" } });
  });

  it("should shift the card by the cascade", () => {
    expect(createNode("note", { x: 0, y: 0 }, { id: "a", cascade: 20 })).toMatchObject({ x: -90, y: -28, label: "" });
  });
});

describe("insertNode", () => {
  it("should put groups first so they draw behind the other cards", () => {
    const nodes = [node({ id: "a" })];
    expect(insertNode(nodes, node({ id: "g", type: "group" })).map((n) => n.id)).toEqual(["g", "a"]);
    expect(insertNode(nodes, node({ id: "b" })).map((n) => n.id)).toEqual(["a", "b"]);
  });
});
