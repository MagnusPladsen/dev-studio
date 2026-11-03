import { ImportError } from "../types";
import type { TiledChunk, TiledImage, TiledLayer, TiledMap, TiledTileset, TiledTilesetRef } from "./tiled-model";
import { decodeTileData, type TileEncoding } from "./tile-data";

function parseXml(text: string): Element {
  let root: Element | null = null;
  try {
    root = new DOMParser().parseFromString(text, "application/xml").documentElement;
  } catch {
    root = null;
  }
  if (!root || root.nodeName === "parsererror" || root.getElementsByTagName("parsererror").length > 0) {
    throw new ImportError("This file isn't valid XML. Was it changed after it was saved?");
  }
  return root;
}

const childElements = (element: Element, tag?: string): Element[] =>
  Array.from(element.childNodes).filter((node): node is Element => node.nodeType === 1 && (!tag || (node as Element).nodeName === tag));
const firstChild = (element: Element, tag: string): Element | undefined => childElements(element, tag)[0];
const attr = (element: Element, name: string): string | undefined => element.getAttribute(name) ?? undefined;
const numAttr = (element: Element, name: string, fallback = 0): number => {
  const value = Number(element.getAttribute(name));
  return element.hasAttribute(name) && Number.isFinite(value) ? value : fallback;
};

/** A Tiled XML map (.tmx). */
export async function readTmx(text: string): Promise<TiledMap> {
  const map = parseXml(text);
  if (map.nodeName === "tileset") throw new ImportError("This is a Tiled tileset, not a map. Import the map that uses it, together with this file.");
  if (map.nodeName !== "map") throw new ImportError("This isn't a Tiled map.");
  return {
    orientation: attr(map, "orientation") ?? "orthogonal",
    infinite: attr(map, "infinite") === "1",
    width: numAttr(map, "width"),
    height: numAttr(map, "height"),
    tileWidth: numAttr(map, "tilewidth", 16),
    tileHeight: numAttr(map, "tileheight", 16),
    layers: await readLayers(map, true),
    tilesets: childElements(map, "tileset").map(readTilesetRef),
  };
}

async function readLayers(parent: Element, isParentVisible: boolean): Promise<TiledLayer[]> {
  const read: TiledLayer[] = [];
  for (const element of childElements(parent)) {
    const name = attr(element, "name") ?? "Layer";
    const visible = isParentVisible && attr(element, "visible") !== "0";
    if (element.nodeName === "group") read.push(...(await readLayers(element, visible)));
    else if (element.nodeName === "objectgroup") read.push({ kind: "object", name });
    else if (element.nodeName === "imagelayer") read.push({ kind: "image", name });
    else if (element.nodeName === "layer") read.push({ kind: "tile", name, visible, chunks: await readChunks(element, name) });
  }
  return read;
}

async function readChunks(layer: Element, name: string): Promise<TiledChunk[]> {
  const data = firstChild(layer, "data");
  if (!data) throw new ImportError(`Layer "${name}" has no tile data.`);
  const encoding = attr(data, "encoding") as TileEncoding;
  const compression = attr(data, "compression") || undefined;
  const chunkElements = childElements(data, "chunk");
  const parts = chunkElements.length ? chunkElements : [layer];
  const chunks: TiledChunk[] = [];
  for (const part of parts) {
    const source = part === layer ? data : part;
    const tiles = encoding ? (source.textContent ?? "") : childElements(source, "tile").map((tile) => numAttr(tile, "gid"));
    chunks.push({
      x: numAttr(part, "x"),
      y: numAttr(part, "y"),
      width: numAttr(part, "width"),
      height: numAttr(part, "height"),
      gids: await decodeTileData(tiles, encoding, compression, name),
    });
  }
  return chunks;
}

function readTilesetRef(element: Element): TiledTilesetRef {
  const firstgid = numAttr(element, "firstgid", 1);
  const source = attr(element, "source");
  return source ? { firstgid, source } : { firstgid, tileset: readTilesetElement(element) };
}

function readImage(element: Element | undefined): TiledImage | undefined {
  const source = element && attr(element, "source");
  if (!element || !source) return undefined;
  return { source, width: numAttr(element, "width") || undefined, height: numAttr(element, "height") || undefined };
}

function readTilesetElement(element: Element): TiledTileset {
  const tileImages = new Map<number, TiledImage>();
  for (const tile of childElements(element, "tile")) {
    const image = readImage(firstChild(tile, "image"));
    if (image) tileImages.set(numAttr(tile, "id"), image);
  }
  return {
    name: attr(element, "name") ?? "Tileset",
    tileWidth: numAttr(element, "tilewidth", 16),
    tileHeight: numAttr(element, "tileheight", 16),
    spacing: numAttr(element, "spacing"),
    margin: numAttr(element, "margin"),
    columns: numAttr(element, "columns"),
    image: readImage(firstChild(element, "image")),
    tileImages,
  };
}

/** An external Tiled XML tileset (.tsx). */
export function readTsx(text: string): TiledTileset {
  const root = parseXml(text);
  if (root.nodeName !== "tileset") throw new ImportError("This isn't a Tiled tileset.");
  return readTilesetElement(root);
}
