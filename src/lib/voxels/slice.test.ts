import { describe, expect, it } from "vitest";
import { createGrid, voxelIndex, type Vec3 } from "./grid";
import { cellToSlice, sliceDims, sliceFloodCells, sliceRectBox, sliceRectCells, sliceToCell, type SliceAxis } from "./slice";

const SIZE: Vec3 = [4, 5, 6];

describe("slice", () => {
  it.each(["x", "y", "z"] as SliceAxis[])("maps cells to slice points and back on axis %s", (axis) => {
    for (const cell of [[0, 0, 0], [3, 4, 5], [1, 2, 3]] as Vec3[]) {
      const { layer, point } = cellToSlice(SIZE, axis, cell);
      expect(sliceToCell(SIZE, axis, layer, point)).toEqual(cell);
    }
  });

  it("uses the matching dimensions per axis", () => {
    expect(sliceDims(SIZE, "y")).toEqual([4, 6]);
    expect(sliceDims(SIZE, "z")).toEqual([4, 5]);
    expect(sliceDims(SIZE, "x")).toEqual([6, 5]);
  });

  it("puts the top of the model at the top of front and side slices", () => {
    expect(sliceToCell(SIZE, "z", 0, [0, 0])[1]).toBe(4);
    expect(sliceToCell(SIZE, "x", 0, [0, 0])[1]).toBe(4);
  });

  it("fills a connected same-colour area on one layer only", () => {
    const grid = createGrid([3, 3, 3]);
    // a wall in the middle column of layer y=0, and something on the next layer
    for (const z of [0, 1, 2]) grid.data[voxelIndex(grid.size, 1, 0, z)] = 4;
    grid.data[voxelIndex(grid.size, 0, 1, 0)] = 2;
    const cells = sliceFloodCells(grid, "y", 0, [0, 0]);
    expect(cells).toHaveLength(3);
    expect(cells.every(([x, y]) => x === 0 && y === 0)).toBe(true);
  });

  it("selects a rectangle on one layer or through all layers", () => {
    expect(sliceRectBox(SIZE, "y", 2, [0, 1], [2, 3], false)).toEqual({ min: [0, 2, 1], max: [2, 2, 3] });
    expect(sliceRectBox(SIZE, "y", 2, [0, 1], [2, 3], true)).toEqual({ min: [0, 0, 1], max: [2, 4, 3] });
    expect(sliceRectCells(SIZE, "y", 0, [0, 0], [1, 1])).toHaveLength(4);
  });
});
