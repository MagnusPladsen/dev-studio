import { strToU8, zipSync, type Zippable } from "fflate";
import { godotSpriteFiles, godotTilemapFiles } from "./godot";
import { fileStem } from "./names";
import { phaserSpriteFiles, phaserTilemapFiles } from "./phaser";
import { tiledSpriteFiles, tiledTilemapFiles } from "./tiled";
import { unitySpriteFiles, unityTilemapFiles } from "./unity";
import type { Engine, ExportFile, SpriteExport, TilemapExport } from "./types";

export type { Engine, ExportFile, SpriteExport, TilemapExport } from "./types";
export { buildTileAtlas } from "./tile-atlas";

/** One-click engine exports: a zip laid out the way each engine expects, with a README saying how to load it. */

interface EngineInfo {
  id: Engine;
  label: string;
  sprite: { description: string; files: (sprite: SpriteExport) => ExportFile[] };
  tilemap: { description: string; files: (tilemap: TilemapExport) => ExportFile[] };
}

export const ENGINES: EngineInfo[] = [
  {
    id: "godot",
    label: "Godot 4",
    sprite: { description: "SpriteFrames with an animation per tag, an AnimatedSprite2D scene, the sheet PNG", files: godotSpriteFiles },
    tilemap: { description: "TileSet with terrains and collision, a TileMapLayer scene, the tiles PNG", files: godotTilemapFiles },
  },
  {
    id: "unity",
    label: "Unity",
    sprite: { description: "Sheet PNG sliced by its .meta, an Animation Clip per tag", files: unitySpriteFiles },
    tilemap: { description: "Sliced tiles PNG, the map as PNG and JSON", files: unityTilemapFiles },
  },
  {
    id: "phaser",
    label: "Phaser 3",
    sprite: { description: "Sheet PNG and Aseprite JSON for createFromAseprite", files: phaserSpriteFiles },
    tilemap: { description: "Tiled JSON with collision as a tile property, the tiles PNG", files: phaserTilemapFiles },
  },
  {
    id: "tiled",
    label: "Tiled",
    sprite: { description: "A tileset (.tsx) with the tags as tile animations", files: tiledSpriteFiles },
    tilemap: { description: "TMX, TSX and JSON with Wang sets and a Collision object layer", files: tiledTilemapFiles },
  },
];

export function zipFiles(files: ExportFile[]): Uint8Array {
  const entries: Zippable = {};
  // PNGs are already compressed, so they're stored as they are
  for (const file of files) entries[file.path] = typeof file.data === "string" ? strToU8(file.data) : [file.data, { level: 0 }];
  return zipSync(entries, { level: 6 });
}

export function zipBlob(files: ExportFile[]): Blob {
  return new Blob([zipFiles(files) as Uint8Array<ArrayBuffer>], { type: "application/zip" });
}

export function engineZipName(name: string, fallback: string, engine: Engine): string {
  return `${fileStem(name, fallback)}_${engine}.zip`;
}
