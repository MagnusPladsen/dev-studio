import type { TilemapLayer, TilemapTerrain } from "@/types";

/**
 * Auto-tiling: each cell of a terrain shows the tile for which of its neighbours are the same terrain.
 *
 * - "edge16" looks at the four sides: mask bits N = 1, E = 2, S = 4, W = 8 (16 tiles, 0 = alone, 15 = surrounded).
 * - "blob47" also looks at the corners: N = 1, NE = 2, E = 4, SE = 8, S = 16, SW = 32, W = 64, NW = 128. A corner
 *   only counts when both sides next to it are the same terrain, which leaves 47 distinct masks (255 = surrounded).
 *
 * A cell belongs to a terrain when its tile is one of the terrain's tiles. Cells outside the map count as empty.
 */

export type Tile = TilemapLayer["tiles"][number][number];
export type TerrainKind = TilemapTerrain["kind"];

const SIDES = [
  { bit: 1, dx: 0, dy: -1 },
  { bit: 2, dx: 1, dy: 0 },
  { bit: 4, dx: 0, dy: 1 },
  { bit: 8, dx: -1, dy: 0 },
];

/** Blob bits in clockwise order from north; a corner sits between the sides before and after it. */
const BLOB_NEIGHBOURS = [
  { bit: 1, dx: 0, dy: -1 },
  { bit: 2, dx: 1, dy: -1, sides: [1, 4] },
  { bit: 4, dx: 1, dy: 0 },
  { bit: 8, dx: 1, dy: 1, sides: [4, 16] },
  { bit: 16, dx: 0, dy: 1 },
  { bit: 32, dx: -1, dy: 1, sides: [16, 64] },
  { bit: 64, dx: -1, dy: 0 },
  { bit: 128, dx: -1, dy: -1, sides: [64, 1] },
];

export const FULL_MASK: Record<TerrainKind, number> = { edge16: 15, blob47: 255 };
export const TERRAIN_SIZE: Record<TerrainKind, number> = { edge16: 16, blob47: 47 };

/** Drops corner bits whose two sides aren't both set. */
export function reduceBlobMask(mask: number): number {
  let reduced = mask;
  for (const { bit, sides } of BLOB_NEIGHBOURS) {
    if (sides && !(mask & sides[0] && mask & sides[1])) reduced &= ~bit;
  }
  return reduced;
}

const BLOB_MASKS = [...new Set(Array.from({ length: 256 }, (_, mask) => reduceBlobMask(mask)))].sort((a, b) => a - b);

/** Every mask a terrain of this kind has a tile for, in the order the editor lists them. */
export function terrainMasks(kind: TerrainKind): number[] {
  return kind === "edge16" ? Array.from({ length: 16 }, (_, mask) => mask) : BLOB_MASKS;
}

/** Which neighbours of x,y are the same terrain, as this kind's mask. */
export function neighbourMask(kind: TerrainKind, isSame: (x: number, y: number) => boolean, x: number, y: number): number {
  if (kind === "edge16") return SIDES.reduce((mask, side) => (isSame(x + side.dx, y + side.dy) ? mask | side.bit : mask), 0);
  const mask = BLOB_NEIGHBOURS.reduce((bits, n) => (isSame(x + n.dx, y + n.dy) ? bits | n.bit : bits), 0);
  return reduceBlobMask(mask);
}

/** Names the neighbours in a mask, e.g. "N, E, NE", for slot tooltips. */
export function describeMask(kind: TerrainKind, mask: number): string {
  const names = kind === "edge16" ? ["N", "E", "S", "W"] : ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const set = names.filter((_, i) => mask & (1 << i));
  return set.length ? set.join(", ") : "none";
}

/** Is the neighbour at dx,dy (each -1…1) part of this mask? The centre always is. */
export function maskIncludes(kind: TerrainKind, mask: number, dx: number, dy: number): boolean {
  if (dx === 0 && dy === 0) return true;
  const list = kind === "edge16" ? SIDES : BLOB_NEIGHBOURS;
  const neighbour = list.find((n) => n.dx === dx && n.dy === dy);
  return !!neighbour && (mask & neighbour.bit) !== 0;
}

/** The tile a terrain shows for a mask: its own, else the surrounded tile, else any tile it has. */
export function terrainTile(terrain: TilemapTerrain, mask: number): number | string | null {
  return terrain.tiles[mask] ?? terrain.tiles[FULL_MASK[terrain.kind]] ?? Object.values(terrain.tiles)[0] ?? null;
}

export function terrainMembers(terrain: TilemapTerrain): Set<number | string> {
  return new Set(Object.values(terrain.tiles));
}

export function hasTerrainTiles(terrain: TilemapTerrain): boolean {
  return Object.keys(terrain.tiles).length > 0;
}

const copyGrid = (tiles: Tile[][]) => tiles.map((row) => [...row]);

/** Re-picks the tiles of the cells (and their neighbours) that belong to the terrain. */
function retile(tiles: Tile[][], terrain: TilemapTerrain, members: Set<number | string>, cells: Iterable<[number, number]>) {
  const isSame = (x: number, y: number) => {
    const tile = tiles[y]?.[x];
    return tile !== null && tile !== undefined && members.has(tile);
  };
  const touched = new Map<string, [number, number]>();
  for (const [x, y] of cells) {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) touched.set(`${x + dx},${y + dy}`, [x + dx, y + dy]);
  }
  const picks: [number, number, Tile][] = [];
  for (const [x, y] of touched.values()) {
    if (isSame(x, y)) picks.push([x, y, terrainTile(terrain, neighbourMask(terrain.kind, isSame, x, y))]);
  }
  for (const [x, y, tile] of picks) tiles[y][x] = tile;
}

/** Paints the cells with the terrain and fixes up the tiles around them. Returns a new grid. */
export function paintTerrain(tiles: Tile[][], terrain: TilemapTerrain, cells: [number, number][]): Tile[][] {
  if (!hasTerrainTiles(terrain)) return tiles;
  const next = copyGrid(tiles);
  const members = terrainMembers(terrain);
  const placeholder = terrainTile(terrain, FULL_MASK[terrain.kind]);
  for (const [x, y] of cells) if (next[y]?.[x] !== undefined) next[y][x] = placeholder;
  retile(next, terrain, members, cells);
  return next;
}

/** Empties the cells and fixes up the tiles of any terrain around them. Returns a new grid. */
export function eraseWithTerrains(tiles: Tile[][], terrains: TilemapTerrain[], cells: [number, number][]): Tile[][] {
  const next = copyGrid(tiles);
  for (const [x, y] of cells) if (next[y]?.[x] !== undefined) next[y][x] = null;
  for (const terrain of terrains) if (hasTerrainTiles(terrain)) retile(next, terrain, terrainMembers(terrain), cells);
  return next;
}
