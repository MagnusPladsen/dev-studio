import { ImportError } from "../types";
import type { ExportedTileType } from "@/lib/tilemap/tiled-export";
import type { TiledChunk, TiledImage, TiledLayer, TiledMap, TiledTileset, TiledTilesetRef } from "./tiled-model";
import { decodeTileData, type TileEncoding } from "./tile-data";

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);
const num = (value: unknown, fallback = 0) => (typeof value === "number" && Number.isFinite(value) ? value : fallback);
const str = (value: unknown) => (typeof value === "string" ? value : undefined);

export const isTiledJsonTileset = (data: unknown): boolean => isObject(data) && data.type === "tileset";

/** A Tiled JSON map (.tmj) or the Tilemap's own JSON export. */
export async function readTiledJsonMap(data: unknown): Promise<TiledMap> {
  if (isTiledJsonTileset(data)) throw new ImportError("This is a Tiled tileset, not a map. Import the map that uses it, together with this file.");
  if (!isObject(data) || !Array.isArray(data.layers) || typeof data.width !== "number") throw new ImportError("This isn't a Tiled map.");
  const ownTileTypes = Array.isArray(data.tileset) ? (data.tileset as ExportedTileType[]) : undefined;
  return {
    name: str(data.name),
    orientation: str(data.orientation) ?? "orthogonal",
    infinite: data.infinite === true,
    width: num(data.width),
    height: num(data.height),
    tileWidth: num(data.tilewidth, 16),
    tileHeight: num(data.tileheight, 16),
    layers: await readLayers(data.layers, true),
    tilesets: Array.isArray(data.tilesets) ? data.tilesets.filter(isObject).map(readTilesetRef) : [],
    ownTileTypes,
  };
}

async function readLayers(layers: unknown[], isParentVisible: boolean): Promise<TiledLayer[]> {
  const read: TiledLayer[] = [];
  for (const layer of layers.filter(isObject)) {
    const name = str(layer.name) ?? "Layer";
    const visible = isParentVisible && layer.visible !== false;
    if (layer.type === "group") read.push(...(await readLayers(Array.isArray(layer.layers) ? layer.layers : [], visible)));
    else if (layer.type === "objectgroup") read.push({ kind: "object", name });
    else if (layer.type === "imagelayer") read.push({ kind: "image", name });
    else if (layer.type === "tilelayer") read.push({ kind: "tile", name, visible, chunks: await readChunks(layer, name) });
  }
  return read;
}

async function readChunks(layer: Json, name: string): Promise<TiledChunk[]> {
  const encoding = str(layer.encoding) as TileEncoding;
  const compression = str(layer.compression) || undefined;
  const parts = Array.isArray(layer.chunks) ? layer.chunks.filter(isObject) : [{ ...layer, x: 0, y: 0 }];
  const chunks: TiledChunk[] = [];
  for (const part of parts) {
    const gids = await decodeTileData(part.data, encoding === "csv" ? "csv" : encoding, compression, name);
    chunks.push({ x: num(part.x), y: num(part.y), width: num(part.width), height: num(part.height), gids });
  }
  return chunks;
}

function readTilesetRef(ref: Json): TiledTilesetRef {
  const firstgid = num(ref.firstgid, 1);
  const source = str(ref.source);
  return source ? { firstgid, source } : { firstgid, tileset: readTiledJsonTileset(ref) };
}

/** An embedded tileset or an external .tsj file. */
export function readTiledJsonTileset(data: unknown): TiledTileset {
  if (!isObject(data)) throw new ImportError("This isn't a Tiled tileset.");
  const tileImages = new Map<number, TiledImage>();
  for (const tile of Array.isArray(data.tiles) ? data.tiles.filter(isObject) : []) {
    const source = str(tile.image);
    if (source) tileImages.set(num(tile.id), { source, width: num(tile.imagewidth) || undefined, height: num(tile.imageheight) || undefined });
  }
  const image = str(data.image);
  return {
    name: str(data.name) ?? "Tileset",
    tileWidth: num(data.tilewidth, 16),
    tileHeight: num(data.tileheight, 16),
    spacing: num(data.spacing),
    margin: num(data.margin),
    columns: num(data.columns),
    image: image ? { source: image, width: num(data.imagewidth) || undefined, height: num(data.imageheight) || undefined } : undefined,
    tileImages,
  };
}
