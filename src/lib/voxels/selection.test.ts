import { describe, expect, it } from "vitest";
import { createGrid, voxelIndex, type Vec3, type VoxelGrid } from "./grid";
import {
  boundsOfFilled,
  boxSize,
  clampMove,
  clearRegion,
  copyRegion,
  fitBox,
  flipClip,
  normalizeBox,
  pasteClip,
  rotateClip,
  type Axis,
} from "./selection";

function gridWith(size: Vec3, cells: [number, number, number, number][]): VoxelGrid {
  const grid = createGrid(size);
  for (const [x, y, z, v] of cells) grid.data[voxelIndex(size, x, y, z)] = v;
  return grid;
}

const L_SHAPE = gridWith([3, 2, 1], [
  [0, 0, 0, 1],
  [1, 0, 0, 2],
  [2, 0, 0, 3],
  [0, 1, 0, 4],
]);

describe("selection", () => {
  it("normalizes boxes from any two corners", () => {
    expect(normalizeBox([3, 0, 5], [1, 2, 4])).toEqual({ min: [1, 0, 4], max: [3, 2, 5] });
    expect(boxSize(normalizeBox([3, 0, 5], [1, 2, 4]))).toEqual([3, 3, 2]);
  });

  it.each([0, 1, 2] as Axis[])("rotating 4 times around axis %i gives the original", (axis) => {
    let clip = L_SHAPE;
    for (let i = 0; i < 4; i++) clip = rotateClip(clip, axis);
    expect(clip.size).toEqual(L_SHAPE.size);
    expect([...clip.data]).toEqual([...L_SHAPE.data]);
  });

  it("rotating once swaps the other two dimensions and keeps every cube", () => {
    const turned = rotateClip(L_SHAPE, 1);
    expect(turned.size).toEqual([1, 2, 3]);
    expect([...turned.data].filter(Boolean).sort()).toEqual([1, 2, 3, 4]);
  });

  it.each([0, 1, 2] as Axis[])("flipping twice on axis %i gives the original", (axis) => {
    const twice = flipClip(flipClip(L_SHAPE, axis), axis);
    expect([...twice.data]).toEqual([...L_SHAPE.data]);
  });

  it("flips along X", () => {
    const flipped = flipClip(L_SHAPE, 0);
    expect(flipped.data[voxelIndex(flipped.size, 0, 0, 0)]).toBe(3);
    expect(flipped.data[voxelIndex(flipped.size, 2, 1, 0)]).toBe(4);
  });

  it("clamps moves at the grid edge", () => {
    const box = normalizeBox([0, 0, 0], [1, 1, 1]);
    expect(clampMove(box, [-1, 0, 2], [4, 4, 4])).toEqual({ delta: [0, 0, 2], clamped: true });
    expect(clampMove(box, [1, 1, 1], [4, 4, 4])).toEqual({ delta: [1, 1, 1], clamped: false });
    expect(clampMove(box, [5, 0, 0], [4, 4, 4]).delta).toEqual([2, 0, 0]);
  });

  it("copy, clear and paste round-trip a region", () => {
    const grid = gridWith([4, 4, 4], [
      [1, 1, 1, 5],
      [2, 1, 1, 6],
      [3, 3, 3, 9],
    ]);
    const box = normalizeBox([1, 1, 1], [2, 1, 1]);
    const clip = copyRegion(grid, box);
    const cleared = clearRegion(grid, box);
    expect(cleared.data[voxelIndex(grid.size, 1, 1, 1)]).toBe(0);
    expect(cleared.data[voxelIndex(grid.size, 3, 3, 3)]).toBe(9);
    const restored = pasteClip(cleared, clip, box.min);
    expect([...restored.data]).toEqual([...grid.data]);
    // moving: clear, then paste one cell higher
    const moved = pasteClip(cleared, clip, [1, 2, 1]);
    expect(moved.data[voxelIndex(grid.size, 1, 2, 1)]).toBe(5);
    expect(moved.data[voxelIndex(grid.size, 1, 1, 1)]).toBe(0);
  });

  it("paste skips empty clip cells and out-of-grid cells", () => {
    const grid = gridWith([2, 2, 2], [[0, 0, 0, 7]]);
    const clip = gridWith([2, 1, 1], [[1, 0, 0, 3]]);
    const pasted = pasteClip(grid, clip, [0, 0, 0]);
    expect(pasted.data[voxelIndex(grid.size, 0, 0, 0)]).toBe(7);
    expect(pasted.data[voxelIndex(grid.size, 1, 0, 0)]).toBe(3);
    expect(() => pasteClip(grid, clip, [1, 1, 1])).not.toThrow();
  });

  it("finds the bounds of filled cells", () => {
    expect(boundsOfFilled(createGrid([3, 3, 3]))).toBeNull();
    expect(boundsOfFilled(gridWith([4, 4, 4], [[1, 0, 2, 1], [3, 2, 0, 1]]))).toEqual({ min: [1, 0, 0], max: [3, 2, 2] });
  });

  it("fits a box inside the grid", () => {
    expect(fitBox([3, 0, 0], [2, 1, 1], [4, 4, 4])).toEqual({ min: [2, 0, 0], max: [3, 0, 0] });
  });
});
