import { describe, expect, it } from "vitest";
import { COLLISION, collisionFromRects, collisionGrid, collisionRects, hasCollision, paintCollision } from "./collision";

describe("collision grid", () => {
  it("is all empty for old maps without one", () => {
    const grid = collisionGrid({ width: 3, height: 2 });
    expect(grid).toEqual([[0, 0, 0], [0, 0, 0]]);
    expect(hasCollision(undefined)).toBe(false);
  });

  it("pads short rows and drops unknown values", () => {
    expect(collisionGrid({ width: 3, height: 2, collision: [[1, 7], [2, 2, 2, 2]] })).toEqual([[1, 0, 0], [2, 2, 2]]);
  });

  it("paints solid, one-way and empty cells", () => {
    let grid = collisionGrid({ width: 3, height: 1 });
    grid = paintCollision(grid, [[0, 0], [1, 0]], COLLISION.solid);
    grid = paintCollision(grid, [[2, 0]], COLLISION.oneWay);
    expect(grid).toEqual([[1, 1, 2]]);
    grid = paintCollision(grid, [[1, 0]], COLLISION.empty);
    expect(grid).toEqual([[1, 0, 2]]);
    expect(hasCollision(grid)).toBe(true);
  });

  it("returns the same grid when nothing changes", () => {
    const grid = collisionGrid({ width: 2, height: 1 });
    expect(paintCollision(grid, [[0, 0], [5, 5]], COLLISION.empty)).toBe(grid);
  });
});

describe("collision rectangles", () => {
  it("joins runs along rows and stacks matching rows", () => {
    const grid = [
      [1, 1, 0, 2],
      [1, 1, 0, 0],
      [1, 1, 1, 1],
    ];
    expect(collisionRects(grid)).toEqual([
      { x: 0, y: 0, width: 2, height: 2, value: 1 },
      { x: 3, y: 0, width: 1, height: 1, value: 2 },
      { x: 0, y: 2, width: 4, height: 1, value: 1 },
    ]);
  });

  it("turns rectangles back into the same grid", () => {
    const grid = [
      [0, 2, 2, 0],
      [1, 0, 0, 1],
      [1, 1, 1, 1],
    ];
    expect(collisionFromRects(collisionRects(grid), 4, 3)).toEqual(grid);
  });

  it("marks cells whose centre is inside a rectangle, clipped to the map", () => {
    const grid = collisionFromRects([{ x: 0.6, y: -1, width: 9, height: 1.6, value: 1 }], 3, 2);
    expect(grid).toEqual([[0, 1, 1], [0, 0, 0]]);
  });
});
