import { describe, expect, it } from "vitest";
import type { DiagramNode } from "@/types";
import { drawingData, drawingStroke, placedPoints, simplifyPath, smoothPath, strokeFromPoints } from "./freehand";

const drawing = (extra: Partial<DiagramNode>): DiagramNode => ({ id: "d", type: "drawing", x: 0, y: 0, width: 10, height: 10, label: "", ...extra });

describe("simplifyPath", () => {
  it("should drop points when they lie on a straight line", () => {
    const line = [0, 1, 2, 3, 4].map((x) => ({ x: x * 10, y: 0 }));
    expect(simplifyPath(line)).toEqual([{ x: 0, y: 0 }, { x: 40, y: 0 }]);
  });

  it("should keep a corner when the path turns", () => {
    const corner = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 20, y: 20 }];
    expect(simplifyPath(corner)).toEqual([{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }]);
  });

  it("should drop jitter when it stays within the tolerance", () => {
    expect(simplifyPath([{ x: 0, y: 0 }, { x: 5, y: 1 }, { x: 10, y: 0 }], 1.5)).toHaveLength(2);
  });
});

describe("strokeFromPoints", () => {
  it("should place points relative to the stroke's top-left when drawn anywhere on the board", () => {
    const stroke = strokeFromPoints([{ x: 100, y: 50 }, { x: 120, y: 80 }]);
    expect(stroke).toMatchObject({ x: 100, y: 50, width: 20, height: 30 });
    expect(stroke.points).toEqual([{ x: 0, y: 0 }, { x: 20, y: 30 }]);
  });

  it("should make a dot when the pointer only tapped", () => {
    const stroke = strokeFromPoints([{ x: 5, y: 5 }]);
    expect(stroke.points).toEqual([{ x: 0, y: 0 }, { x: 0, y: 0 }]);
    expect(stroke).toMatchObject({ width: 1, height: 1 });
  });
});

describe("drawingStroke", () => {
  it("should read points stored by drawingData when loaded back", () => {
    const stroke = strokeFromPoints([{ x: 0, y: 0 }, { x: 40, y: 20 }]);
    const node = drawing({ width: 40, height: 20, data: drawingData(stroke) });
    expect(drawingStroke(node)).toEqual({ points: stroke.points, box: { width: 40, height: 20 } });
  });

  it("should skip malformed points when the saved data is damaged", () => {
    const node = drawing({ data: { points: [[1, 2], "x", [3]] } });
    expect(drawingStroke(node).points).toEqual([{ x: 1, y: 2 }]);
  });
});

describe("placedPoints", () => {
  it("should scale the points when the drawing was resized", () => {
    const node = drawing({ x: 10, y: 10, width: 80, height: 20, data: { points: [[0, 0], [40, 20]], box: { width: 40, height: 20 } } });
    expect(placedPoints(node)).toEqual([{ x: 10, y: 10 }, { x: 90, y: 30 }]);
  });
});

describe("smoothPath", () => {
  it("should draw a straight segment when there are two points", () => {
    expect(smoothPath([{ x: 0, y: 0 }, { x: 10, y: 5 }])).toBe("M0 0 L10 5");
  });

  it("should curve through midpoints when there are more points", () => {
    expect(smoothPath([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }])).toBe("M0 0 Q10 0 10 5 L10 10");
  });
});
