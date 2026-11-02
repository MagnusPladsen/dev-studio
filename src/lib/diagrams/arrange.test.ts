import { describe, expect, it } from "vitest";
import type { DiagramNode } from "@/types";
import { alignRects, bringToFront, distributeRects, idsWithin, rectBetween, sendToBack, toggleId } from "./arrange";

const node = (id: string): DiagramNode => ({ id, type: "note", x: 0, y: 0, width: 10, height: 10, label: "" });
const ids = (nodes: DiagramNode[]) => nodes.map((n) => n.id);

describe("toggleId", () => {
  it("should add the id when it isn't selected", () => {
    expect(toggleId(["a"], "b")).toEqual(["a", "b"]);
  });

  it("should remove the id when it's already selected", () => {
    expect(toggleId(["a", "b"], "a")).toEqual(["b"]);
  });
});

describe("rectBetween", () => {
  it("should give a positive size when dragged up and to the left", () => {
    expect(rectBetween({ x: 50, y: 40 }, { x: 10, y: 0 })).toEqual({ x: 10, y: 0, width: 40, height: 40 });
  });
});

describe("idsWithin", () => {
  it("should pick only rects when they lie entirely inside the area", () => {
    const area = { x: 0, y: 0, width: 100, height: 100 };
    const rects = [
      { id: "in", x: 10, y: 10, width: 50, height: 50 },
      { id: "half", x: 80, y: 10, width: 50, height: 50 },
    ];
    expect(idsWithin(area, rects)).toEqual(["in"]);
  });
});

describe("bringToFront", () => {
  it("should move the chosen nodes to the end when brought to front, keeping their order", () => {
    expect(ids(bringToFront([node("a"), node("b"), node("c"), node("d")], ["c", "a"]))).toEqual(["b", "d", "a", "c"]);
  });
});

describe("sendToBack", () => {
  it("should move the chosen nodes to the start when sent to back, keeping their order", () => {
    expect(ids(sendToBack([node("a"), node("b"), node("c"), node("d")], ["d", "b"]))).toEqual(["b", "d", "a", "c"]);
  });
});

describe("alignRects", () => {
  const rects = [
    { id: "a", x: 10, y: 0, width: 20, height: 10 },
    { id: "b", x: 40, y: 50, width: 60, height: 30 },
  ];

  it("should line up left edges when aligning left", () => {
    expect(alignRects(rects, "left").get("b")).toEqual({ x: 10, y: 50 });
  });

  it("should line up right edges when aligning right", () => {
    expect(alignRects(rects, "right").get("a")).toEqual({ x: 80, y: 0 });
  });

  it("should centre rects on the shared bounds when aligning center", () => {
    expect(alignRects(rects, "center").get("a")).toEqual({ x: 45, y: 0 });
  });

  it("should line up top edges when aligning top", () => {
    expect(alignRects(rects, "top").get("b")).toEqual({ x: 40, y: 0 });
  });

  it("should centre rects vertically when aligning middle", () => {
    expect(alignRects(rects, "middle").get("a")).toEqual({ x: 10, y: 35 });
  });

  it("should line up bottom edges when aligning bottom", () => {
    expect(alignRects(rects, "bottom").get("a")).toEqual({ x: 10, y: 70 });
  });
});

describe("distributeRects", () => {
  it("should leave equal gaps between rects when distributing horizontally", () => {
    const positions = distributeRects(
      [
        { id: "a", x: 0, y: 5, width: 10, height: 10 },
        { id: "c", x: 90, y: 5, width: 10, height: 10 },
        { id: "b", x: 20, y: 5, width: 20, height: 10 },
      ],
      "horizontal"
    );
    expect(positions.get("a")).toEqual({ x: 0, y: 5 });
    expect(positions.get("b")).toEqual({ x: 40, y: 5 });
    expect(positions.get("c")).toEqual({ x: 90, y: 5 });
  });

  it("should leave equal gaps between rects when distributing vertically", () => {
    const positions = distributeRects(
      [
        { id: "a", x: 0, y: 0, width: 10, height: 10 },
        { id: "b", x: 0, y: 15, width: 10, height: 10 },
        { id: "c", x: 0, y: 100, width: 10, height: 10 },
      ],
      "vertical"
    );
    expect(positions.get("b")).toEqual({ x: 0, y: 50 });
  });

  it("should keep positions when fewer than three rects are given", () => {
    const rects = [
      { id: "a", x: 0, y: 0, width: 10, height: 10 },
      { id: "b", x: 50, y: 0, width: 10, height: 10 },
    ];
    expect(distributeRects(rects, "horizontal").get("b")).toEqual({ x: 50, y: 0 });
  });
});
