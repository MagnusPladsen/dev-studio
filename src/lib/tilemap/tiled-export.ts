import type { TilemapData } from "@/types";

/** The colours of the Tilemap's basic tiles; a number tile is an index into this list. */
export const BASIC_TILES = [
  "#4a7c59", "#6b8f3c", "#8b6914", "#a0522d",
  "#708090", "#4682b4", "#2e8b57", "#daa520",
  "#cd853f", "#8fbc8f", "#556b2f", "#b8860b",
  "#d2691e", "#bc8f8f", "#f4a460", "#c0c0c0",
];

type Tile = TilemapData["layers"][number]["tiles"][number][number];

export interface ExportedTileType {
  id: number;
  type: "sprite" | "color";
  spriteId?: string;
  name?: string;
  color?: string;
}

/** Tiled-style JSON: each layer is a flat array of tile ids (0 = empty), with a tileset table. */
export function toTiledJson(tilemap: TilemapData, spriteName: (spriteId: string) => string | undefined) {
  const gids = new Map<string, number>();
  const tileset: ExportedTileType[] = [];
  const gidFor = (t: Tile): number => {
    if (t === null || t === undefined) return 0;
    const key = typeof t === "number" ? `color:${t}` : `sprite:${t}`;
    let gid = gids.get(key);
    if (!gid) {
      gid = gids.size + 1;
      gids.set(key, gid);
      if (typeof t === "number") tileset.push({ id: gid, type: "color", color: BASIC_TILES[t % BASIC_TILES.length] });
      else tileset.push({ id: gid, type: "sprite", spriteId: t, name: spriteName(t) });
    }
    return gid;
  };
  return {
    name: tilemap.name,
    width: tilemap.width,
    height: tilemap.height,
    tilewidth: tilemap.tileSize,
    tileheight: tilemap.tileSize,
    orientation: "orthogonal",
    renderorder: "right-down",
    layers: tilemap.layers.map((l, i) => ({
      id: i + 1,
      name: l.name,
      type: "tilelayer",
      visible: l.visible,
      width: tilemap.width,
      height: tilemap.height,
      data: l.tiles.flatMap((row) => row.map(gidFor)),
    })),
    tileset,
  };
}
