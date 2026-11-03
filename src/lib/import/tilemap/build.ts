import { v4 as uuid } from "uuid";
import type { Sprite, TilemapLayer } from "@/types";
import { BASIC_TILES, type ExportedTileType } from "@/lib/tilemap/tiled-export";
import type { ImageCodec } from "../image/codec";
import { ImportError, MissingFilesError, type ImportResult } from "../types";
import type { TiledChunk, TiledLayer, TiledMap, TilemapImport } from "./tiled-model";
import { isFlipped, tileIdOf } from "./tile-data";
import { missingImages, planImageCuts, resolveTilesets, spritesFromCuts } from "./tilesets";

/** The Tilemap's own limit for a new map. */
export const MAX_MAP_SIZE = 256;

type Tile = TilemapLayer["tiles"][number][number];
type TileLayer = Extract<TiledLayer, { kind: "tile" }>;
interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
const were = (count: number) => (count === 1 ? "was" : "were");

/** What a map is read with: the other picked or dropped files, and whether to go on without missing ones. */
export interface BuildContext {
  files: File[];
  skipMissing: boolean;
  codec: ImageCodec;
}

/** Turns a Tiled map into a tilemap, plus one sprite per tileset tile it uses. */
export async function buildTilemapImport(map: TiledMap, fileName: string, context: BuildContext): Promise<ImportResult<TilemapImport>> {
  if (map.orientation !== "orthogonal") {
    throw new ImportError(`This is an ${map.orientation} map. Only orthogonal (square grid) maps can be imported.`);
  }
  const warnings: string[] = [];
  const tileLayers = map.layers.filter((layer): layer is TileLayer => layer.kind === "tile");
  const bounds = mapBounds(map, tileLayers, warnings);
  const usedGids = new Set(tileLayers.flatMap((layer) => layer.chunks.flatMap((chunk) => chunk.gids.filter(Boolean).map(tileIdOf))));
  const { tileByGid, sprites } = map.ownTileTypes
    ? { tileByGid: ownTileLookup(map.ownTileTypes, warnings), sprites: [] }
    : await tilesetLookup(map, usedGids, context, warnings);
  const layers = tileLayers.map((layer) => toTilemapLayer(layer, bounds, tileByGid));
  warnAboutTiles(tileLayers, tileByGid, warnings);
  warnAboutSkippedLayers(map.layers, warnings);
  if (map.tileWidth !== map.tileHeight) {
    warnings.push(`Tiles are ${map.tileWidth}×${map.tileHeight} px; the Tilemap uses square tiles, so they show as ${map.tileWidth}×${map.tileWidth}.`);
  }
  return { items: [{ tilemap: tilemapOf(map, fileName, bounds, layers), sprites }], warnings };
}

function tilemapOf(map: TiledMap, fileName: string, bounds: Bounds, layers: TilemapLayer[]): TilemapImport["tilemap"] {
  const spriteIds = new Set(layers.flatMap((layer) => layer.tiles.flat().filter((tile): tile is string => typeof tile === "string")));
  return {
    id: uuid(),
    projectId: "",
    name: map.name || fileName.replace(/\.[^.]+$/, "") || "Imported map",
    width: bounds.width,
    height: bounds.height,
    tileSize: map.tileWidth,
    layers: layers.length ? layers : [{ id: uuid(), name: "Ground", visible: true, tiles: emptyTiles(bounds) }],
    tilesetSpriteIds: [...spriteIds],
    tags: [],
    createdAt: "",
    updatedAt: "",
  };
}

/** A finite map's own size, or for an infinite map the rectangle around the tiles in use. */
function mapBounds(map: TiledMap, layers: TileLayer[], warnings: string[]): Bounds {
  let bounds: Bounds = { x: 0, y: 0, width: map.width, height: map.height };
  if (map.infinite) {
    bounds = usedBounds(layers.flatMap((layer) => layer.chunks)) ?? { x: 0, y: 0, width: 1, height: 1 };
    warnings.push(`This was an infinite map; it was cut to the ${bounds.width}×${bounds.height} tiles in use.`);
  } else {
    for (const layer of layers) {
      if (layer.chunks[0]?.gids.length !== map.width * map.height) throw new ImportError(`Layer "${layer.name}" doesn't have ${map.width}×${map.height} tiles.`);
    }
  }
  if (bounds.width < 1 || bounds.height < 1) throw new ImportError("This map has no size.");
  if (bounds.width > MAX_MAP_SIZE || bounds.height > MAX_MAP_SIZE) {
    throw new ImportError(`This map is ${bounds.width}×${bounds.height} tiles. Maps up to ${MAX_MAP_SIZE}×${MAX_MAP_SIZE} can be imported.`);
  }
  return bounds;
}

function usedBounds(chunks: TiledChunk[]): Bounds | null {
  let [left, top, right, bottom] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const chunk of chunks) {
    chunk.gids.forEach((gid, i) => {
      if (!gid) return;
      const x = chunk.x + (i % chunk.width);
      const y = chunk.y + Math.floor(i / chunk.width);
      [left, top, right, bottom] = [Math.min(left, x), Math.min(top, y), Math.max(right, x), Math.max(bottom, y)];
    });
  }
  return left === Infinity ? null : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

const emptyTiles = (bounds: Bounds): Tile[][] => Array.from({ length: bounds.height }, () => new Array<Tile>(bounds.width).fill(null));

function toTilemapLayer(layer: TileLayer, bounds: Bounds, tileByGid: Map<number, Tile>): TilemapLayer {
  const tiles = emptyTiles(bounds);
  for (const chunk of layer.chunks) {
    chunk.gids.forEach((gid, i) => {
      const x = chunk.x + (i % chunk.width) - bounds.x;
      const y = chunk.y + Math.floor(i / chunk.width) - bounds.y;
      if (gid && y >= 0 && y < bounds.height && x >= 0 && x < bounds.width) tiles[y][x] = tileByGid.get(tileIdOf(gid)) ?? null;
    });
  }
  return { id: uuid(), name: layer.name, visible: layer.visible, tiles };
}

/** The Tilemap's own export: each gid is a basic tile colour or one of the project's sprites. */
function ownTileLookup(types: ExportedTileType[], warnings: string[]): Map<number, Tile> {
  const tileByGid = new Map<number, Tile>();
  let unknownColors = 0;
  for (const type of types) {
    const colorIndex = BASIC_TILES.indexOf(type.color ?? "");
    if (type.type === "sprite" && type.spriteId) tileByGid.set(type.id, type.spriteId);
    else if (type.type === "color" && colorIndex >= 0) tileByGid.set(type.id, colorIndex);
    else unknownColors++;
  }
  if (unknownColors) warnings.push(`${plural(unknownColors, "tile type")} ${were(unknownColors)} not a basic tile or sprite and ${were(unknownColors)} left empty.`);
  return tileByGid;
}

async function tilesetLookup(map: TiledMap, usedGids: Set<number>, context: BuildContext, warnings: string[]): Promise<{ tileByGid: Map<number, Tile>; sprites: Sprite[] }> {
  const missing = new Set<string>();
  const placed = await resolveTilesets(map.tilesets, context.files, missing);
  const cuts = planImageCuts(placed, usedGids);
  missingImages(cuts, context.files).forEach((name) => missing.add(name));
  if (missing.size && !context.skipMissing) throw new MissingFilesError([...missing]);
  if (missing.size) warnings.push(`Left out tiles from missing files: ${[...missing].join(", ")}.`);
  const { sprites, spriteIdByGid } = await spritesFromCuts(cuts, context.files, context.codec);
  if (sprites.length) warnings.push(`Made ${plural(sprites.length, "sprite")} from the tileset tiles this map uses.`);
  return { tileByGid: spriteIdByGid, sprites };
}

function warnAboutTiles(layers: TileLayer[], tileByGid: Map<number, Tile>, warnings: string[]) {
  let flipped = 0;
  let unknown = 0;
  for (const gid of layers.flatMap((layer) => layer.chunks.flatMap((chunk) => chunk.gids))) {
    if (!gid) continue;
    if (isFlipped(gid)) flipped++;
    if (!tileByGid.has(tileIdOf(gid))) unknown++;
  }
  if (flipped) warnings.push(`${plural(flipped, "tile")} ${were(flipped)} flipped or rotated; the Tilemap has no flips, so ${flipped === 1 ? "it faces" : "they face"} the default way.`);
  if (unknown) warnings.push(`${plural(unknown, "tile")} had no tileset image and were left empty.`);
}

function warnAboutSkippedLayers(layers: TiledLayer[], warnings: string[]) {
  const skipped = layers.filter((layer) => layer.kind !== "tile").map((layer) => `"${layer.name}" (${layer.kind === "object" ? "objects" : "image"})`);
  if (skipped.length) warnings.push(`The Tilemap has no object or image layers, so these were skipped: ${skipped.join(", ")}.`);
}
