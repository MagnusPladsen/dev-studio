import { describe, expect, it } from "vitest";
import { shapeOutline } from "./shapes";

const box = { x: 0, y: 0, width: 100, height: 60 };

describe("shapeOutline", () => {
  it("should touch the box's edge midpoints when the shape is a diamond", () => {
    expect(shapeOutline("diamond", box)).toEqual({
      kind: "polygon",
      points: [{ x: 50, y: 0 }, { x: 100, y: 30 }, { x: 50, y: 60 }, { x: 0, y: 30 }],
    });
  });

  it("should fill the box when the shape is an ellipse", () => {
    expect(shapeOutline("ellipse", box)).toEqual({ kind: "ellipse", cx: 50, cy: 30, rx: 50, ry: 30 });
  });

  it("should round the corners when the shape is a rectangle", () => {
    expect(shapeOutline("rectangle", box)).toMatchObject({ kind: "rect", width: 100, height: 60, radius: 8 });
  });

  it("should poke out past the box when the shape is a flow-chart condition", () => {
    const outline = shapeOutline("condition", box);
    expect(outline.kind === "polygon" && outline.points[0]).toEqual({ x: 50, y: -4 });
  });
});
