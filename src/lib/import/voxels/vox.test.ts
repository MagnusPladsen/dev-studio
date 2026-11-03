import { describe, expect, it } from "vitest";
import { runImporter } from "@/lib/import";
import { decodeVoxels } from "@/lib/voxels/codec";
import { toVox } from "@/lib/voxels/export-vox";
import { createGrid, getVoxel, voxelIndex, type Vec3 } from "@/lib/voxels/grid";
import { binaryFile } from "../image/test-images";
import { defaultVoxPalette, readVox, voxImporter, voxToGrid } from "./vox";

const COLORS = ["#ff0000", "#00ff00", "#0000ff"];

function sampleGrid() {
  const grid = createGrid([16, 16, 16]);
  grid.data[voxelIndex(grid.size, 1, 0, 2)] = 1;
  grid.data[voxelIndex(grid.size, 5, 3, 9)] = 3;
  grid.data[voxelIndex(grid.size, 15, 15, 15)] = 3;
  return grid;
}

/** A hand-built .vox: one model of `size` with `voxels` [x, y, z, colour], no palette chunk unless given. */
function voxBytes(size: Vec3, voxels: number[][], models = 1): Uint8Array {
  const chunk = (id: string, content: number[]) => {
    const bytes = [...id].map((c) => c.charCodeAt(0));
    const head = new DataView(new ArrayBuffer(8));
    head.setInt32(0, content.length, true);
    return [...bytes, ...new Uint8Array(head.buffer), ...content];
  };
  const int32 = (n: number) => [...new Uint8Array(new Int32Array([n]).buffer)];
  const children: number[] = [];
  for (let model = 0; model < models; model++) {
    children.push(...chunk("SIZE", size.flatMap(int32)), ...chunk("XYZI", [...int32(voxels.length), ...voxels.flat()]));
  }
  children.push(...chunk("nTRN", [1, 2, 3, 4]));
  const main = [..."MAIN"].map((c) => c.charCodeAt(0));
  const counts = new DataView(new ArrayBuffer(8));
  counts.setInt32(4, children.length, true);
  return new Uint8Array([...[..."VOX "].map((c) => c.charCodeAt(0)), 150, 0, 0, 0, ...main, ...new Uint8Array(counts.buffer), ...children]);
}

describe("MagicaVoxel import", () => {
  it("should round-trip the app's own .vox export", async () => {
    const original = sampleGrid();
    const outcome = await runImporter(voxImporter, binaryFile(toVox(original, COLORS), "tree.vox"));
    if (!outcome.ok) throw new Error(outcome.message);
    const [model] = outcome.result.items;
    const data = decodeVoxels(model.voxels, 16 ** 3);
    const colorAt = (grid: Uint8Array, colors: string[], x: number, y: number, z: number) => colors[grid[voxelIndex([16, 16, 16], x, y, z)] - 1];
    expect(model.size).toEqual([16, 16, 16]);
    expect(model.name).toBe("tree");
    for (const [x, y, z] of [[1, 0, 2], [5, 3, 9], [15, 15, 15]]) expect(colorAt(data, model.colors, x, y, z)).toBe(colorAt(original.data, COLORS, x, y, z));
    expect(data.filter(Boolean)).toHaveLength(3);
    expect(model.colors).toHaveLength(2);
    expect(outcome.result.warnings).toEqual([]);
  });

  it("should use MagicaVoxel's default palette when the file has none", () => {
    const { colors } = voxToGrid(readVox(voxBytes([2, 2, 2], [[0, 0, 0, 1], [1, 1, 1, 216]])));
    expect(colors).toEqual(["#ffffff", "#ee0000"]);
    expect(defaultVoxPalette()).toHaveLength(255);
  });

  it("should centre a small model on the floor of the smallest grid that holds it", () => {
    const { grid } = voxToGrid(readVox(voxBytes([3, 3, 10], [[0, 2, 0, 1]])));
    expect(grid.size).toEqual([16, 16, 16]);
    // x: 0 + (16-3)/2 → 6; up: vox z 0 → 0; depth: 3 - 1 - 2 = 0 → + 6.
    expect(getVoxel(grid, 6, 0, 6)).toBe(1);
  });

  it("should shrink a model bigger than 64 and say so", () => {
    const { grid, warnings } = voxToGrid(readVox(voxBytes([130, 1, 1], [[129, 0, 0, 1]])));
    expect(grid.size).toEqual([64, 64, 64]);
    expect(warnings).toEqual(["The model is 130×1×1; it was shrunk 3× to fit the 64-cube grid"]);
    expect(grid.data.filter(Boolean)).toHaveLength(1);
  });

  it("should take the first of several models with a warning", () => {
    expect(voxToGrid(readVox(voxBytes([1, 1, 1], [[0, 0, 0, 1]], 2))).warnings).toEqual(["This file has 2 models; only the first was imported"]);
  });

  it("should refuse empty models, other files and damaged ones", async () => {
    await expect(runImporter(voxImporter, binaryFile(voxBytes([4, 4, 4], []), "empty.vox"))).resolves.toMatchObject({ ok: false, message: "This .vox model has no cubes in it." });
    await expect(runImporter(voxImporter, binaryFile(new Uint8Array(40), "x.vox"))).resolves.toMatchObject({ ok: false, message: expect.stringContaining("isn't a MagicaVoxel") });
    await expect(runImporter(voxImporter, binaryFile(voxBytes([1, 1, 1], [[0, 0, 0, 1]]).subarray(0, 40), "cut.vox"))).resolves.toMatchObject({ ok: false, message: expect.stringContaining("damaged") });
  });
});
