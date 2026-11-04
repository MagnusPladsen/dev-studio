import { describe, expect, it } from "vitest";
import type { TilemapData, TilemapTerrain } from "@/types";
import { levelExamples } from "@/lib/examples/levels";
import { eraseWithTerrains, neighbourMask, paintTerrain, reduceBlobMask, terrainMasks, terrainTile, type Tile } from "./autotile";

/** A terrain whose tile for each mask is the string "m<mask>", so a cell shows which neighbours it saw. */
function terrain(kind: TilemapTerrain["kind"]): TilemapTerrain {
  return { id: "t", name: "Ground", kind, tiles: Object.fromEntries(terrainMasks(kind).map((mask) => [mask, `m${mask}`])) };
}

const empty = (width: number, height: number): Tile[][] => Array.from({ length: height }, () => new Array<Tile>(width).fill(null));

function paintAll(grid: Tile[][], t: TilemapTerrain, cells: [number, number][]) {
  return cells.reduce((g, cell) => paintTerrain(g, t, [cell]), grid);
}

describe("auto-tile masks", () => {
  it("has 16 edge masks and 47 blob masks", () => {
    expect(terrainMasks("edge16")).toHaveLength(16);
    expect(terrainMasks("blob47")).toHaveLength(47);
    expect(terrainMasks("blob47")[0]).toBe(0);
    expect(terrainMasks("blob47").at(-1)).toBe(255);
  });

  it("only counts a corner when both sides next to it are set", () => {
    expect(reduceBlobMask(2)).toBe(0); // NE alone
    expect(reduceBlobMask(1 | 2)).toBe(1); // N + NE, no E
    expect(reduceBlobMask(1 | 2 | 4)).toBe(7); // N + NE + E
  });

  it("treats cells outside the map as empty", () => {
    const isSame = (x: number, y: number) => x >= 0 && y >= 0 && x < 2 && y < 2;
    expect(neighbourMask("edge16", isSame, 0, 0)).toBe(2 | 4);
    expect(neighbourMask("blob47", isSame, 0, 0)).toBe(4 | 8 | 16);
  });
});

describe("painting with an edge (16-tile) terrain", () => {
  const ground = terrain("edge16");

  it("gives an isolated cell the no-neighbours tile", () => {
    expect(paintTerrain(empty(3, 3), ground, [[1, 1]])[1][1]).toBe("m0");
  });

  it("picks end and middle tiles along a row and updates the neighbours", () => {
    const grid = paintAll(empty(3, 1), ground, [[0, 0], [1, 0], [2, 0]]);
    expect(grid[0]).toEqual(["m2", "m10", "m8"]); // E · E+W · W
  });

  it("surrounds a cell in a 3×3 block and gives the edges their sides", () => {
    const cells: [number, number][] = [];
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) cells.push([x, y]);
    const grid = paintTerrain(empty(3, 3), ground, cells);
    expect(grid).toEqual([
      ["m6", "m14", "m12"],
      ["m7", "m15", "m13"],
      ["m3", "m11", "m9"],
    ]);
  });

  it("leaves other tiles alone", () => {
    const grid = empty(3, 1);
    grid[0][0] = "rock";
    expect(paintTerrain(grid, ground, [[1, 0]])[0]).toEqual(["rock", "m0", null]);
  });

  it("falls back to the surrounded tile for masks without their own tile", () => {
    const partial: TilemapTerrain = { id: "p", name: "Partial", kind: "edge16", tiles: { 15: "full", 0: "alone" } };
    expect(terrainTile(partial, 0)).toBe("alone");
    expect(terrainTile(partial, 5)).toBe("full");
    expect(paintAll(empty(2, 1), partial, [[0, 0], [1, 0]])[0]).toEqual(["full", "full"]);
  });

  it("does nothing with a terrain that has no tiles yet", () => {
    const grid = empty(2, 2);
    expect(paintTerrain(grid, { id: "e", name: "Empty", kind: "edge16", tiles: {} }, [[0, 0]])).toBe(grid);
  });
});

describe("painting with a blob (47-tile) terrain", () => {
  const ground = terrain("blob47");

  it("uses corner tiles only where both sides are filled", () => {
    // an L shape: the corner cell (0,1) has N and E neighbours but no NE cell
    const grid = paintAll(empty(2, 2), ground, [[0, 0], [0, 1], [1, 1]]);
    expect(grid[1][0]).toBe(`m${1 | 4}`);
    const filled = paintTerrain(grid, ground, [[1, 0]]);
    expect(filled[1][0]).toBe(`m${1 | 2 | 4}`); // N + NE + E now that the corner is filled
    expect(filled[0][0]).toBe(`m${4 | 8 | 16}`);
  });

  it("gives an isolated cell the no-neighbours tile", () => {
    expect(paintTerrain(empty(3, 3), ground, [[1, 1]])[1][1]).toBe("m0");
  });

  it("gives the middle of a 3×3 block the surrounded tile", () => {
    const cells: [number, number][] = [];
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) cells.push([x, y]);
    expect(paintTerrain(empty(3, 3), ground, cells)[1][1]).toBe("m255");
  });
});

describe("erasing next to a terrain", () => {
  const ground = terrain("edge16");

  it("empties the cell and fixes its neighbours", () => {
    const row = paintAll(empty(3, 1), ground, [[0, 0], [1, 0], [2, 0]]);
    expect(eraseWithTerrains(row, [ground], [[1, 0]])[0]).toEqual(["m0", null, "m0"]);
  });

  it("leaves tiles that belong to no terrain as they are", () => {
    const grid: Tile[][] = [["rock", "rock", "rock"]];
    expect(eraseWithTerrains(grid, [ground], [[1, 0]])[0]).toEqual(["rock", null, "rock"]);
  });
});

describe("the example level's Ground terrain", () => {
  const ctx = { projectId: "p", id: (slug: string) => `p--ex--${slug}` };
  const meadows = levelExamples.find((module) => module.collection === "tilemaps")!.build(ctx) as unknown as TilemapData[];
  const meadow = meadows[0];
  const ground = meadow.terrains![0];

  it("matches the hand-painted ground when repainted", () => {
    const members = new Set(Object.values(ground.tiles));
    const tiles = meadow.layers[0].tiles;
    const cells = tiles.flatMap((row, y) => row.flatMap((tile, x): [number, number][] => (tile !== null && members.has(tile) ? [[x, y]] : [])));
    expect(paintTerrain(tiles, ground, cells)).toEqual(tiles);
  });
});
