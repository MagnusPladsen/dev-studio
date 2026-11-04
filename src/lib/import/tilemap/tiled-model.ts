import type { Sprite, TilemapData } from "@/types";
import type { ExportedTerrain, ExportedTileType } from "@/lib/tilemap/tiled-export";

/** One imported map plus the sprites made from its tilesets. */
export interface TilemapImport {
  tilemap: TilemapData;
  sprites: Sprite[];
}

/** A rectangle of tile ids. A finite map's layer is one chunk at 0,0; an infinite map's layer is many. */
export interface TiledChunk {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Global tile ids with Tiled's flip flags still in the top bits; 0 = empty. */
  gids: number[];
}

/** An object on an object layer, in pixels. Only rectangles can become collision. */
export interface TiledObject {
  shape: "rectangle" | "other";
  x: number;
  y: number;
  width: number;
  height: number;
  /** Tiled's object type (called class since Tiled 1.9). */
  type: string;
  isOneWay: boolean;
}

export type TiledLayer =
  | { kind: "tile"; name: string; visible: boolean; chunks: TiledChunk[] }
  | { kind: "object"; name: string; objects: TiledObject[] }
  | { kind: "image"; name: string };

export interface TiledImage {
  source: string;
  width?: number;
  height?: number;
}

export interface TiledTileset {
  name: string;
  tileWidth: number;
  tileHeight: number;
  spacing: number;
  margin: number;
  columns: number;
  /** One image sliced into tiles… */
  image?: TiledImage;
  /** …or one image per tile ("collection of images"), keyed by local tile id. */
  tileImages: Map<number, TiledImage>;
}

export type TiledTilesetRef = { firstgid: number } & ({ source: string } | { tileset: TiledTileset });

/** A Tiled map (.tmj or .tmx) read into one shape, whatever the file format. */
export interface TiledMap {
  name?: string;
  orientation: string;
  /** Infinite maps keep their tiles in chunks around 0,0; the import cuts them to the tiles in use. */
  infinite: boolean;
  width: number;
  height: number;
  tileWidth: number;
  tileHeight: number;
  layers: TiledLayer[];
  tilesets: TiledTilesetRef[];
  /** Only in the Tilemap's own JSON export: what each gid stands for (a basic tile colour or a sprite id). */
  ownTileTypes?: ExportedTileType[];
  /** Only in the Tilemap's own JSON export: its terrains, with gids for tiles. */
  ownTerrains?: ExportedTerrain[];
}
