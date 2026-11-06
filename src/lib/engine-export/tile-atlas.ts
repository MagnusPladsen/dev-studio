import type { TilemapData, TilemapTerrain } from "@/types";
import { COLLISION, collisionGrid } from "@/lib/tilemap/collision";

type Tile = number | string;
type SolidOrOneWay = typeof COLLISION.solid | typeof COLLISION.oneWay;

/** What an atlas cell shows: a map tile (basic colour or sprite), or the marker of a kind of collision. */
export type AtlasSource = { kind: "tile"; tile: Tile } | { kind: "collision"; value: SolidOrOneWay };

export interface AtlasCell {
  source: AtlasSource;
  /** Set when the cell is one slot of an auto-tile terrain: which terrain, and which neighbours it matches. */
  terrain?: { index: number; mask: number };
}

/**
 * The tileset every engine export draws: one cell per terrain slot (a tile used in two slots gets two cells, since an
 * engine tile has one set of neighbour rules), then the map's other tiles, then a solid and a one-way collision tile.
 */
export interface TileAtlas {
  tileSize: number;
  columns: number;
  rows: number;
  cells: AtlasCell[];
  /** Cell index of each map tile, keyed by `tileKey`. */
  tileCells: Map<string, number>;
  collisionCells: Record<SolidOrOneWay, number>;
}

export const tileKey = (tile: Tile): string => (typeof tile === "number" ? `color:${tile}` : `sprite:${tile}`);

/** The tile in each cell of a layer, row by row; short or missing rows read as empty. */
export function layerTiles(tilemap: TilemapData, layerIndex: number): (Tile | null)[][] {
  const tiles = tilemap.layers[layerIndex]?.tiles;
  return Array.from({ length: tilemap.height }, (_, y) => Array.from({ length: tilemap.width }, (_, x) => tiles?.[y]?.[x] ?? null));
}

function terrainSlots(terrains: TilemapTerrain[]): AtlasCell[] {
  return terrains.flatMap((terrain, index) =>
    Object.entries(terrain.tiles)
      .map(([mask, tile]) => ({ mask: Number(mask), tile }))
      .filter(({ mask, tile }) => Number.isInteger(mask) && (typeof tile === "number" || typeof tile === "string"))
      .sort((a, b) => a.mask - b.mask)
      .map(({ mask, tile }): AtlasCell => ({ source: { kind: "tile", tile }, terrain: { index, mask } }))
  );
}

export function buildTileAtlas(tilemap: TilemapData): TileAtlas {
  const cells = terrainSlots(tilemap.terrains ?? []);
  const tileCells = new Map<string, number>();
  cells.forEach((cell, i) => {
    if (cell.source.kind === "tile" && !tileCells.has(tileKey(cell.source.tile))) tileCells.set(tileKey(cell.source.tile), i);
  });
  tilemap.layers.forEach((_, layerIndex) => {
    for (const tile of layerTiles(tilemap, layerIndex).flat()) {
      if (tile === null || tileCells.has(tileKey(tile))) continue;
      tileCells.set(tileKey(tile), cells.length);
      cells.push({ source: { kind: "tile", tile } });
    }
  });
  const collisionCells = { [COLLISION.solid]: cells.length, [COLLISION.oneWay]: cells.length + 1 } as Record<SolidOrOneWay, number>;
  cells.push({ source: { kind: "collision", value: COLLISION.solid } }, { source: { kind: "collision", value: COLLISION.oneWay } });
  const columns = Math.ceil(Math.sqrt(cells.length));
  return { tileSize: tilemap.tileSize, columns, rows: Math.ceil(cells.length / columns), cells, tileCells, collisionCells };
}

/** A cell's column and row in the atlas grid. */
export const cellCoords = (atlas: TileAtlas, index: number): { x: number; y: number } => ({ x: index % atlas.columns, y: Math.floor(index / atlas.columns) });

/** Each layer as atlas cell indexes (null = empty). */
export function layerCells(tilemap: TilemapData, atlas: TileAtlas, layerIndex: number): (number | null)[][] {
  return layerTiles(tilemap, layerIndex).map((row) => row.map((tile) => (tile === null ? null : (atlas.tileCells.get(tileKey(tile)) ?? null))));
}

/** The collision grid as atlas cell indexes of the collision tiles (null = no collision). */
export function collisionCellGrid(tilemap: TilemapData, atlas: TileAtlas): (number | null)[][] {
  return collisionGrid(tilemap).map((row) => row.map((value) => (value === COLLISION.empty ? null : atlas.collisionCells[value])));
}

export const hasAnyCell = (grid: (number | null)[][]): boolean => grid.some((row) => row.some((cell) => cell !== null));
