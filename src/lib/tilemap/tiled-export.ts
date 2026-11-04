import type { TilemapData, TilemapTerrain } from "@/types";
import { COLLISION, COLLISION_TYPES, collisionRects, hasCollision } from "./collision";

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

/** A terrain in the export, with each tile written as its gid. */
export interface ExportedTerrain {
  name: string;
  kind: TilemapTerrain["kind"];
  tiles: Record<string, number>;
}

/** The name of the object layer collision is written to. */
export const COLLISION_LAYER_NAME = "Collision";

/**
 * Collision as a Tiled object layer of rectangles (in pixels), typed "solid" or "one_way" and with a `one_way`
 * bool property, which Tiled shows and Godot's Tiled importers turn into collision shapes.
 */
function collisionLayer(tilemap: TilemapData, id: number) {
  const size = tilemap.tileSize;
  return {
    id,
    name: COLLISION_LAYER_NAME,
    type: "objectgroup",
    visible: true,
    opacity: 1,
    x: 0,
    y: 0,
    draworder: "topdown",
    objects: collisionRects(tilemap.collision ?? []).map((rect, i) => ({
      id: i + 1,
      name: "",
      type: COLLISION_TYPES[rect.value],
      x: rect.x * size,
      y: rect.y * size,
      width: rect.width * size,
      height: rect.height * size,
      rotation: 0,
      visible: true,
      properties: [{ name: "one_way", type: "bool", value: rect.value === COLLISION.oneWay }],
    })),
  };
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
  const layers: object[] = tilemap.layers.map((l, i) => ({
    id: i + 1,
    name: l.name,
    type: "tilelayer",
    visible: l.visible,
    width: tilemap.width,
    height: tilemap.height,
    data: l.tiles.flatMap((row) => row.map(gidFor)),
  }));
  if (hasCollision(tilemap.collision)) layers.push(collisionLayer(tilemap, layers.length + 1));
  const terrains = (tilemap.terrains ?? []).map((terrain): ExportedTerrain => ({
    name: terrain.name,
    kind: terrain.kind,
    tiles: Object.fromEntries(Object.entries(terrain.tiles).map(([mask, tile]) => [mask, gidFor(tile)])),
  }));
  return {
    name: tilemap.name,
    width: tilemap.width,
    height: tilemap.height,
    tilewidth: tilemap.tileSize,
    tileheight: tilemap.tileSize,
    orientation: "orthogonal",
    renderorder: "right-down",
    nextlayerid: layers.length + 1,
    layers,
    tileset,
    ...(terrains.length ? { terrains } : {}),
  };
}
