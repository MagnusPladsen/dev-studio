import type { FrameTag, TilemapData } from "@/types";
import type { TileAtlas } from "./tile-atlas";

export type Engine = "godot" | "unity" | "phaser" | "tiled";

/** One file in an engine zip; `path` is relative to the zip's root and uses `/`. */
export interface ExportFile {
  path: string;
  data: string | Uint8Array;
}

/** A Pixel Art sprite, already drawn into a sheet (the `sheetLayout` grid). */
export interface SpriteExport {
  name: string;
  width: number;
  height: number;
  /** Each frame's duration in ms, as the editor plays it. */
  durations: number[];
  tags: FrameTag[];
  columns: number;
  rows: number;
  sheetPng: Uint8Array;
}

/** A Tilemap with its tiles drawn into an atlas (`buildTileAtlas`) and the whole map drawn into one picture. */
export interface TilemapExport {
  tilemap: TilemapData;
  atlas: TileAtlas;
  atlasPng: Uint8Array;
  mapPng: Uint8Array;
}
