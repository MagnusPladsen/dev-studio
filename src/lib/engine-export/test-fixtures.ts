import { deflateSync, crc32 } from "node:zlib";
import type { TilemapData } from "@/types";
import { levelExamples } from "@/lib/examples/levels";
import { sheetLayout } from "@/lib/sprite-animation";
import { buildTileAtlas } from "./tile-atlas";
import type { SpriteExport, TilemapExport } from "./types";

/** For tests: real (tiny) PNGs, sprites and tilemaps to export. */

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** An RGBA PNG whose pixels come from `pixel`. */
export function pngBytes(width: number, height: number, pixel: (x: number, y: number) => [number, number, number, number]): Uint8Array {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8);
  const rows = Array.from({ length: height }, (_, y) => Buffer.from([0, ...Array.from({ length: width }, (_, x) => pixel(x, y)).flat()]));
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return new Uint8Array(Buffer.concat([signature, chunk("IHDR", header), chunk("IDAT", deflateSync(Buffer.concat(rows))), chunk("IEND", Buffer.alloc(0))]));
}

/** A checker of colours, one per cell, so each frame or tile looks different. */
const cellColours = (size: number) => (x: number, y: number): [number, number, number, number] => {
  const cell = Math.floor(x / size) * 7 + Math.floor(y / size) * 13;
  return [(cell * 47) % 256, (cell * 91) % 256, (cell * 151) % 256, 255];
};

function spriteExport(name: string, size: number, durations: number[], tags: SpriteExport["tags"]): SpriteExport {
  const { columns, rows } = sheetLayout(durations.length, size, size);
  return { name, width: size, height: size, durations, tags, columns, rows, sheetPng: pngBytes(columns * size, rows * size, cellColours(size)) };
}

const tag = (name: string, from: number, to: number, direction: "forward" | "reverse" | "pingpong" = "forward") => ({ id: name, name, from, to, color: "#5aa9e6", direction });

/** Pip, as in the examples: idle and walk tags, plus a ping-pong and a reverse tag with a repeated name. */
export const PIP = spriteExport("Pip (walk)", 8, [1200, 150, 150, 150, 150, 150], [tag("idle", 0, 1), tag("walk", 2, 5), tag("hop", 3, 5, "pingpong"), tag("walk", 2, 4, "reverse")]);

/** An older sprite: no tags, every frame at the same speed. */
export const COIN = spriteExport("Coin", 8, [125, 125, 125, 125], []);

const ctx = { projectId: "p", id: (slug: string) => `p--ex--${slug}` };

export const MEADOW = (levelExamples.find((module) => module.collection === "tilemaps")!.build(ctx) as unknown as TilemapData[])[0];

/** A small map with what older maps lack or get wrong: a blob terrain, one-way platforms, a short row, a hidden layer. */
export const CAVE: TilemapData = {
  id: "cave",
  projectId: "p",
  name: "Crystal Cave",
  width: 4,
  height: 3,
  tileSize: 8,
  layers: [
    { id: "a", name: "Rock", visible: true, tiles: [[0, 0, 0, 0], ["s-moss", null, null, 3], [0, 0]] },
    { id: "b", name: "Secrets", visible: false, tiles: [[null, null, null, null], [null, "s-gem", null, null], [null, null, null, null]] },
  ],
  tilesetSpriteIds: ["s-moss", "s-gem"],
  terrains: [
    { id: "t-rock", name: "Rock", kind: "edge16", tiles: { 15: 0, 0: 3, 6: 3 } },
    { id: "t-moss", name: "Moss", kind: "blob47", tiles: { 255: "s-moss", 0: "s-moss", 28: 2 } },
  ],
  collision: [[1, 1, 1, 1], [0, 2, 2, 0], [1, 1]],
  tags: [],
  createdAt: "",
  updatedAt: "",
};

/** An older map: no terrains, no collision. */
export const PLAIN: TilemapData = { ...CAVE, id: "plain", name: "Plain", terrains: undefined, collision: undefined };

export function tilemapExport(tilemap: TilemapData): TilemapExport {
  const atlas = buildTileAtlas(tilemap);
  const size = atlas.tileSize;
  return {
    tilemap,
    atlas,
    atlasPng: pngBytes(atlas.columns * size, atlas.rows * size, cellColours(size)),
    mapPng: pngBytes(tilemap.width * size, tilemap.height * size, cellColours(size)),
  };
}
