import { v4 as uuid } from "uuid";
import type { Sprite } from "@/types";
import { baseName, findCompanion } from "../companions";
import { assertFileSize } from "../file-size";
import type { ImageCodec } from "../image/codec";
import { cropImage } from "../image/pixel-image";
import { ImportError } from "../types";
import type { TiledImage, TiledTileset, TiledTilesetRef } from "./tiled-model";
import { readTiledJsonTileset } from "./tiled-json";
import { readTsx } from "./tiled-xml";

/** Biggest map or tileset file read (images have their own cap in `image/limits.ts`). */
export const MAX_TILED_FILE_BYTES = 20 * 1024 * 1024;

export interface TileRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PlacedTileset {
  firstgid: number;
  /** Undefined while its external file is missing. */
  tileset?: TiledTileset;
}

/** Reads the map's tilesets, embedded or external (.tsx / .tsj); names of external files that weren't given go in `missing`. */
export async function resolveTilesets(refs: TiledTilesetRef[], files: File[], missing: Set<string>): Promise<PlacedTileset[]> {
  const placed: PlacedTileset[] = [];
  for (const ref of refs) {
    if ("tileset" in ref) {
      placed.push(ref);
      continue;
    }
    const file = findCompanion(files, ref.source);
    if (!file) missing.add(baseName(ref.source));
    placed.push({ firstgid: ref.firstgid, tileset: file && (await readTilesetFile(file)) });
  }
  return placed.sort((a, b) => a.firstgid - b.firstgid);
}

async function readTilesetFile(file: File): Promise<TiledTileset> {
  assertFileSize(file, MAX_TILED_FILE_BYTES);
  const text = await file.text();
  if (text.trimStart().startsWith("<")) return readTsx(text);
  try {
    return readTiledJsonTileset(JSON.parse(text));
  } catch (error) {
    if (error instanceof ImportError) throw error;
    throw new ImportError(`"${file.name}" isn't a valid Tiled tileset.`);
  }
}

/** One image and the tiles cut from it. */
interface ImageCut {
  tileset: TiledTileset;
  image: TiledImage;
  /** Local tile id → global id, for the tiles the map uses. */
  tiles: Map<number, number>;
}

/** Groups the map's used tiles by the image they come from. Tiles with no tileset or image are left out. */
export function planImageCuts(placed: PlacedTileset[], usedGids: Set<number>): ImageCut[] {
  const cuts = new Map<string, ImageCut>();
  for (const gid of [...usedGids].sort((a, b) => a - b)) {
    const owner = placed.findLast((entry) => entry.firstgid <= gid);
    const tileset = owner?.tileset;
    if (!owner || !tileset) continue;
    const local = gid - owner.firstgid;
    const image = tileset.tileImages.get(local) ?? tileset.image;
    if (!image) continue;
    const key = `${owner.firstgid}:${image.source}`;
    const cut = cuts.get(key) ?? { tileset, image, tiles: new Map() };
    cut.tiles.set(local, gid);
    cuts.set(key, cut);
  }
  return [...cuts.values()];
}

/** Where a tile sits in its tileset image, from the tile size, spacing and margin. */
export function tileRect(tileset: TiledTileset, local: number, imageWidth: number): TileRect {
  const step = tileset.tileWidth + tileset.spacing;
  const columns = tileset.columns || Math.max(1, Math.floor((imageWidth - 2 * tileset.margin + tileset.spacing) / step));
  return {
    x: tileset.margin + (local % columns) * step,
    y: tileset.margin + Math.floor(local / columns) * (tileset.tileHeight + tileset.spacing),
    width: tileset.tileWidth,
    height: tileset.tileHeight,
  };
}

/** Makes one sprite per used tile of each cut whose image was given; returns them and the gid → sprite id map. */
export async function spritesFromCuts(cuts: ImageCut[], files: File[], codec: ImageCodec): Promise<{ sprites: Sprite[]; spriteIdByGid: Map<number, string> }> {
  const sprites: Sprite[] = [];
  const spriteIdByGid = new Map<number, string>();
  for (const cut of cuts) {
    const file = findCompanion(files, cut.image.source);
    if (!file) continue;
    const image = await codec.decode(file);
    const isWholeImage = cut.tileset.tileImages.has([...cut.tiles.keys()][0]);
    for (const [local, gid] of [...cut.tiles].sort(([a], [b]) => a - b)) {
      const rect = isWholeImage ? { x: 0, y: 0, width: image.width, height: image.height } : tileRect(cut.tileset, local, image.width);
      const sprite = tileSprite(`${cut.tileset.name} ${local}`, codec.encode(cropImage(image, rect.x, rect.y, rect.width, rect.height)), rect);
      sprites.push(sprite);
      spriteIdByGid.set(gid, sprite.id);
    }
  }
  return { sprites, spriteIdByGid };
}

function tileSprite(name: string, pixels: string, { width, height }: TileRect): Sprite {
  return {
    id: uuid(),
    projectId: "",
    name,
    width,
    height,
    frames: [{ id: uuid(), pixels, duration: 100 }],
    fps: 8,
    tags: ["tileset"],
    createdAt: "",
    updatedAt: "",
  };
}

/** The image files the used tiles need that weren't given. */
export function missingImages(cuts: ImageCut[], files: File[]): string[] {
  return cuts.filter((cut) => !findCompanion(files, cut.image.source)).map((cut) => baseName(cut.image.source));
}
