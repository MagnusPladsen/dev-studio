import type { TilemapData } from "@/types";
import { TAG_COLORS } from "@/lib/sprite-animation";
import { COLLISION, hasCollision } from "@/lib/tilemap/collision";
import { collisionLayer } from "@/lib/tilemap/tiled-export";
import { collisionCellGrid, layerCells, type TileAtlas } from "./tile-atlas";

/** Real Tiled files (map version 1.10): the map as JSON or TMX, its tileset as JSON or TSX, with Wang sets. */

export const TILED_VERSION = "1.10";

/** How collision is written: Tiled's object layer of rectangles, or a hidden tile layer of collision tiles (Phaser). */
export type CollisionStyle = "objects" | "tiles";

export interface TiledNames {
  /** The tileset image's file name, as the map and tileset refer to it. */
  image: string;
  tilesetName: string;
}

type Property = { name: string; type: "bool" | "string"; value: boolean | string };

export const terrainColor = (index: number): string => TAG_COLORS[index % TAG_COLORS.length];

/** Wang ids list colours clockwise from the top: top, top-right, right, …, top-left. Our masks use the same order. */
export function wangId(kind: "edge16" | "blob47", mask: number): number[] {
  const wang = new Array<number>(8).fill(0);
  if (kind === "edge16") [0, 1, 2, 3].forEach((bit) => mask & (1 << bit) && (wang[bit * 2] = 1));
  else for (let bit = 0; bit < 8; bit++) if (mask & (1 << bit)) wang[bit] = 1;
  return wang;
}

function tilesetWangSets(tilemap: TilemapData, atlas: TileAtlas) {
  return (tilemap.terrains ?? []).map((terrain, index) => ({
    name: terrain.name,
    type: terrain.kind === "edge16" ? "edge" : "mixed",
    tile: -1,
    colors: [{ name: terrain.name, color: terrainColor(index), tile: -1, probability: 1 }],
    wangtiles: atlas.cells.flatMap((cell, tileid) => (cell.terrain?.index === index ? [{ tileid, wangid: wangId(terrain.kind, cell.terrain.mask) }] : [])),
  }));
}

function collisionTileProperties(atlas: TileAtlas): { id: number; properties: Property[] }[] {
  return ([COLLISION.solid, COLLISION.oneWay] as const).map((value) => ({
    id: atlas.collisionCells[value],
    properties: [
      { name: "collides", type: "bool", value: true },
      { name: "one_way", type: "bool", value: value === COLLISION.oneWay },
    ],
  }));
}

/** The tileset as Tiled JSON, without `firstgid` (added where a map embeds it). */
export function tiledTilesetJson(tilemap: TilemapData, atlas: TileAtlas, names: TiledNames) {
  const wangsets = tilesetWangSets(tilemap, atlas);
  return {
    name: names.tilesetName,
    image: names.image,
    imagewidth: atlas.columns * atlas.tileSize,
    imageheight: atlas.rows * atlas.tileSize,
    tilewidth: atlas.tileSize,
    tileheight: atlas.tileSize,
    tilecount: atlas.cells.length,
    columns: atlas.columns,
    margin: 0,
    spacing: 0,
    tiles: collisionTileProperties(atlas),
    ...(wangsets.length ? { wangsets } : {}),
  };
}

const gids = (grid: (number | null)[][]): number[] => grid.flatMap((row) => row.map((cell) => (cell === null ? 0 : cell + 1)));

function tileLayers(tilemap: TilemapData, atlas: TileAtlas, collision: CollisionStyle) {
  const layers = tilemap.layers.map((layer, i) => ({ name: layer.name, visible: layer.visible, data: gids(layerCells(tilemap, atlas, i)) }));
  if (collision === "tiles" && hasCollision(tilemap.collision)) layers.push({ name: "Collision", visible: false, data: gids(collisionCellGrid(tilemap, atlas)) });
  return layers;
}

/** The map as Tiled JSON (.tmj) with its tileset embedded, which Phaser and most engine importers need. */
export function tiledMapJson(tilemap: TilemapData, atlas: TileAtlas, names: TiledNames, collision: CollisionStyle) {
  const layers: object[] = tileLayers(tilemap, atlas, collision).map((layer, i) => ({
    id: i + 1,
    name: layer.name,
    type: "tilelayer",
    x: 0,
    y: 0,
    width: tilemap.width,
    height: tilemap.height,
    opacity: 1,
    visible: layer.visible,
    data: layer.data,
  }));
  const objects = collision === "objects" && hasCollision(tilemap.collision) ? collisionLayer(tilemap, layers.length + 1) : null;
  if (objects) layers.push(objects);
  return {
    type: "map",
    version: TILED_VERSION,
    orientation: "orthogonal",
    renderorder: "right-down",
    infinite: false,
    compressionlevel: -1,
    width: tilemap.width,
    height: tilemap.height,
    tilewidth: tilemap.tileSize,
    tileheight: tilemap.tileSize,
    nextlayerid: layers.length + 1,
    nextobjectid: (objects?.objects.length ?? 0) + 1,
    layers,
    tilesets: [{ firstgid: 1, ...tiledTilesetJson(tilemap, atlas, names) }],
  };
}

export const xmlEscape = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const xmlProperties = (properties: Property[], indent: string): string[] => [
  `${indent}<properties>`,
  ...properties.map((p) => `${indent} <property name="${xmlEscape(p.name)}" type="${p.type}" value="${p.value}"/>`),
  `${indent}</properties>`,
];

/** The tileset as a Tiled XML tileset (.tsx). */
export function tiledTilesetXml(tilemap: TilemapData, atlas: TileAtlas, names: TiledNames): string {
  const json = tiledTilesetJson(tilemap, atlas, names);
  const lines = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<tileset version="${TILED_VERSION}" name="${xmlEscape(json.name)}" tilewidth="${json.tilewidth}" tileheight="${json.tileheight}" tilecount="${json.tilecount}" columns="${json.columns}">`,
    ` <image source="${xmlEscape(json.image)}" width="${json.imagewidth}" height="${json.imageheight}"/>`,
    ...json.tiles.flatMap((tile) => [` <tile id="${tile.id}">`, ...xmlProperties(tile.properties, "  "), ` </tile>`]),
  ];
  if (json.wangsets?.length) {
    lines.push(" <wangsets>");
    for (const set of json.wangsets) {
      lines.push(`  <wangset name="${xmlEscape(set.name)}" type="${set.type}" tile="-1">`);
      for (const color of set.colors) lines.push(`   <wangcolor name="${xmlEscape(color.name)}" color="${color.color}" tile="-1" probability="1"/>`);
      for (const wang of set.wangtiles) lines.push(`   <wangtile tileid="${wang.tileid}" wangid="${wang.wangid.join(",")}"/>`);
      lines.push("  </wangset>");
    }
    lines.push(" </wangsets>");
  }
  lines.push("</tileset>", "");
  return lines.join("\n");
}

const csv = (data: number[], width: number): string =>
  Array.from({ length: Math.ceil(data.length / width) }, (_, row) => data.slice(row * width, (row + 1) * width).join(",")).join(",\n");

/** The map as a Tiled XML map (.tmx) that uses the tileset from `tsxFile`. */
export function tiledMapXml(tilemap: TilemapData, atlas: TileAtlas, tsxFile: string, collision: CollisionStyle): string {
  const layers = tileLayers(tilemap, atlas, collision);
  const objects = collision === "objects" && hasCollision(tilemap.collision) ? collisionLayer(tilemap, layers.length + 1) : null;
  const lines = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<map version="${TILED_VERSION}" orientation="orthogonal" renderorder="right-down" width="${tilemap.width}" height="${tilemap.height}" tilewidth="${tilemap.tileSize}" tileheight="${tilemap.tileSize}" infinite="0" nextlayerid="${layers.length + (objects ? 2 : 1)}" nextobjectid="${(objects?.objects.length ?? 0) + 1}">`,
    ` <tileset firstgid="1" source="${xmlEscape(tsxFile)}"/>`,
  ];
  layers.forEach((layer, i) => {
    lines.push(` <layer id="${i + 1}" name="${xmlEscape(layer.name)}" width="${tilemap.width}" height="${tilemap.height}"${layer.visible ? "" : ` visible="0"`}>`);
    lines.push(`  <data encoding="csv">`, csv(layer.data, tilemap.width), `</data>`, ` </layer>`);
  });
  if (objects) {
    lines.push(` <objectgroup id="${objects.id}" name="${objects.name}">`);
    for (const object of objects.objects) {
      lines.push(`  <object id="${object.id}" type="${object.type}" x="${object.x}" y="${object.y}" width="${object.width}" height="${object.height}">`);
      lines.push(...xmlProperties(object.properties as Property[], "   "), `  </object>`);
    }
    lines.push(" </objectgroup>");
  }
  lines.push("</map>", "");
  return lines.join("\n");
}
