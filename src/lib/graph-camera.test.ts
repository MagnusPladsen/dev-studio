import { describe, expect, it } from "vitest";
import { MAX_SCALE, centerOn, fitCamera, screenToWorld, zoomAt } from "./graph-camera";

describe("zoomAt", () => {
  it("should keep the world point under the anchor in place", () => {
    const camera = { x: 30, y: -20, scale: 1.2 };
    const anchor = { x: 200, y: 150 };
    const before = screenToWorld(camera, anchor);
    const after = screenToWorld(zoomAt(camera, 1.7, anchor), anchor);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it("should clamp the zoom level", () => {
    expect(zoomAt({ x: 0, y: 0, scale: 3 }, 10, { x: 0, y: 0 }).scale).toBe(MAX_SCALE);
  });
});

describe("centerOn", () => {
  it("should put the world point in the middle of the viewport", () => {
    const camera = centerOn({ x: 0, y: 0, scale: 2 }, { x: 10, y: 5 }, { width: 400, height: 300 });
    expect(screenToWorld(camera, { x: 200, y: 150 })).toEqual({ x: 10, y: 5 });
  });
});

describe("fitCamera", () => {
  const viewport = { width: 400, height: 300 };

  it("should centre a single node without zooming in past 1.5x", () => {
    const camera = fitCamera([{ x: 50, y: 50, radius: 5 }], viewport);
    expect(camera.scale).toBe(1.5);
    expect(screenToWorld(camera, { x: 200, y: 150 })).toEqual({ x: 50, y: 50 });
  });

  it("should zoom out until every circle fits inside the padding", () => {
    const circles = [
      { x: -1000, y: 0, radius: 10 },
      { x: 1000, y: 200, radius: 10 },
    ];
    const camera = fitCamera(circles, viewport, 20);
    const left = (circles[0].x - 10) * camera.scale + camera.x;
    const right = (circles[1].x + 10) * camera.scale + camera.x;
    expect(left).toBeCloseTo(20);
    expect(right).toBeCloseTo(380);
  });

  it("should fall back to the identity zoom for an empty graph", () => {
    expect(fitCamera([], viewport)).toEqual({ x: 200, y: 150, scale: 1 });
  });
});
