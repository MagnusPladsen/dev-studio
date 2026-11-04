import type { TilemapData } from "@/types";
import { sheetLayout } from "@/lib/sprite-animation";
import { COLLISION } from "@/lib/tilemap/collision";
import { baseDuration, fileStem, spriteAnimations, uniqueNames } from "./names";
import { godotSpriteReadme, godotTilemapReadme } from "./readmes";
import { cellCoords, collisionCellGrid, hasAnyCell, layerCells, type TileAtlas } from "./tile-atlas";
import { terrainColor } from "./tiled-format";
import type { ExportFile, SpriteExport, TilemapExport } from "./types";

/**
 * Godot 4 text resources (format 3). Paths are relative to the file that names them, which Godot resolves against
 * that file's folder, so the exported folder works wherever it is put in a project.
 */

/** Godot writes floats with a decimal point and at most six significant digits. */
export function gdFloat(value: number): string {
  const rounded = Number(value.toPrecision(6));
  return Number.isInteger(rounded) ? rounded.toFixed(1) : String(rounded);
}

const gdString = (text: string): string => JSON.stringify(text);

/** A node name Godot accepts (no . : @ / " %), in PascalCase. */
export function nodeName(name: string, fallback: string): string {
  const words = name.match(/[A-Za-z0-9]+/g) ?? [];
  return words.map((word) => word[0].toUpperCase() + word.slice(1)).join("") || fallback;
}

/** Godot frame durations are multiples of 1 / speed; the most common duration becomes 1.0. */
function animationEntry(animation: ReturnType<typeof spriteAnimations>[number]): string {
  const base = baseDuration(animation.durations);
  const frames = animation.frames.map(
    (frame, i) => `{\n"duration": ${gdFloat(animation.durations[i] / base)},\n"texture": SubResource("AtlasTexture_${frame}")\n}`
  );
  return `{\n"frames": [${frames.join(", ")}],\n"loop": true,\n"name": &${gdString(animation.name)},\n"speed": ${gdFloat(1000 / base)}\n}`;
}

export function spriteFramesTres(sprite: SpriteExport, sheetFile: string): string {
  const { rects } = sheetLayout(sprite.durations.length, sprite.width, sprite.height);
  const atlasTextures = rects.map(
    (rect, i) => `[sub_resource type="AtlasTexture" id="AtlasTexture_${i}"]\natlas = ExtResource("1_sheet")\nregion = Rect2(${rect.x}, ${rect.y}, ${rect.w}, ${rect.h})\n`
  );
  return [
    `[gd_resource type="SpriteFrames" load_steps=${rects.length + 2} format=3]\n`,
    `[ext_resource type="Texture2D" path=${gdString(sheetFile)} id="1_sheet"]\n`,
    ...atlasTextures,
    `[resource]\nanimations = [${spriteAnimations(sprite).map(animationEntry).join(", ")}]\n`,
  ].join("\n");
}

export function spriteSceneTscn(sprite: SpriteExport, framesFile: string): string {
  const first = spriteAnimations(sprite)[0].name;
  return [
    `[gd_scene load_steps=2 format=3]\n`,
    `[ext_resource type="SpriteFrames" path=${gdString(framesFile)} id="1_frames"]\n`,
    `[node name=${gdString(nodeName(sprite.name, "Sprite"))} type="AnimatedSprite2D"]`,
    `texture_filter = 1`,
    `sprite_frames = ExtResource("1_frames")`,
    `animation = &${gdString(first)}`,
    `autoplay = ${gdString(first)}`,
    ``,
  ].join("\n");
}

export function godotSpriteFiles(sprite: SpriteExport): ExportFile[] {
  const stem = fileStem(sprite.name, "sprite");
  return [
    { path: `${stem}/${stem}.png`, data: sprite.sheetPng },
    { path: `${stem}/${stem}_frames.tres`, data: spriteFramesTres(sprite, `${stem}.png`) },
    { path: `${stem}/${stem}.tscn`, data: spriteSceneTscn(sprite, `${stem}_frames.tres`) },
    { path: `${stem}/README.md`, data: godotSpriteReadme(sprite, stem) },
  ];
}

// ── Tilemap ──

/** Terrain set modes: 0 = match corners and sides (blob47), 2 = match sides (edge16). */
const TERRAIN_MODE = { blob47: 0, edge16: 2 } as const;
/** Peering bit names in our mask's bit order (edge16: N, E, S, W; blob47: clockwise from N). */
const PEERING_BITS = {
  edge16: ["top_side", "right_side", "bottom_side", "left_side"],
  blob47: ["top_side", "top_right_corner", "right_side", "bottom_right_corner", "bottom_side", "bottom_left_corner", "left_side", "top_left_corner"],
} as const;

/** Terrains grouped into one terrain set per kind (Godot sets one matching mode per set). */
function terrainSets(tilemap: TilemapData) {
  const terrains = tilemap.terrains ?? [];
  const kinds = [...new Set(terrains.map((terrain) => terrain.kind))];
  const countPerKind = new Map<string, number>();
  const placeOf = terrains.map((terrain) => {
    const id = countPerKind.get(terrain.kind) ?? 0;
    countPerKind.set(terrain.kind, id + 1);
    return { set: kinds.indexOf(terrain.kind), terrain: id };
  });
  return { kinds, placeOf };
}

function squarePoints(tileSize: number): string {
  const h = tileSize / 2;
  return `PackedVector2Array(${[-h, -h, h, -h, h, h, -h, h].join(", ")})`;
}

function atlasCellLines(tilemap: TilemapData, atlas: TileAtlas): string[] {
  const { placeOf } = terrainSets(tilemap);
  return atlas.cells.flatMap((cell, index) => {
    const { x, y } = cellCoords(atlas, index);
    const key = `${x}:${y}/0`;
    const lines = [`${key} = 0`];
    if (cell.terrain) {
      const terrain = tilemap.terrains![cell.terrain.index];
      const { set, terrain: id } = placeOf[cell.terrain.index];
      lines.push(`${key}/terrain_set = ${set}`, `${key}/terrain = ${id}`);
      PEERING_BITS[terrain.kind].forEach((bit, i) => cell.terrain!.mask & (1 << i) && lines.push(`${key}/terrains_peering_bit/${bit} = ${id}`));
    }
    if (cell.source.kind === "collision") {
      lines.push(`${key}/physics_layer_0/polygon_0/points = ${squarePoints(atlas.tileSize)}`);
      if (cell.source.value === COLLISION.oneWay) lines.push(`${key}/physics_layer_0/polygon_0/one_way = true`);
    }
    return lines;
  });
}

const godotColor = (hex: string): string => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return `Color(${gdFloat(r)}, ${gdFloat(g)}, ${gdFloat(b)}, 1)`;
};

function terrainSetLines(tilemap: TilemapData): string[] {
  const { kinds, placeOf } = terrainSets(tilemap);
  const lines = kinds.map((kind, set) => `terrain_set_${set}/mode = ${TERRAIN_MODE[kind]}`);
  (tilemap.terrains ?? []).forEach((terrain, i) => {
    const { set, terrain: id } = placeOf[i];
    lines.push(`terrain_set_${set}/terrain_${id}/name = ${gdString(terrain.name)}`, `terrain_set_${set}/terrain_${id}/color = ${godotColor(terrainColor(i))}`);
  });
  return lines;
}

export function tileSetTres(tilemap: TilemapData, atlas: TileAtlas, atlasFile: string): string {
  const size = `Vector2i(${atlas.tileSize}, ${atlas.tileSize})`;
  return [
    `[gd_resource type="TileSet" load_steps=3 format=3]\n`,
    `[ext_resource type="Texture2D" path=${gdString(atlasFile)} id="1_tiles"]\n`,
    [`[sub_resource type="TileSetAtlasSource" id="TileSetAtlasSource_tiles"]`, `texture = ExtResource("1_tiles")`, `texture_region_size = ${size}`, ...atlasCellLines(tilemap, atlas), ""].join("\n"),
    [`[resource]`, `tile_size = ${size}`, `physics_layer_0/collision_layer = 1`, ...terrainSetLines(tilemap), `sources/0 = SubResource("TileSetAtlasSource_tiles")`, ""].join("\n"),
  ].join("\n");
}

/** `TileMapLayer.tile_map_data`: a format number (0), then per cell x, y, source, atlas x, atlas y, alternative as 16-bit LE. */
export function tileMapData(grid: (number | null)[][], atlas: TileAtlas): number[] {
  const bytes = [0, 0];
  const u16 = (value: number) => bytes.push(value & 0xff, (value >> 8) & 0xff);
  grid.forEach((row, y) =>
    row.forEach((cell, x) => {
      if (cell === null) return;
      const coords = cellCoords(atlas, cell);
      [x, y, 0, coords.x, coords.y, 0].forEach(u16);
    })
  );
  return bytes;
}

function layerNode(name: string, grid: (number | null)[][], atlas: TileAtlas, extra: string[] = []): string {
  return [
    `[node name=${gdString(name)} type="TileMapLayer" parent="."]`,
    ...extra,
    `tile_map_data = PackedByteArray(${tileMapData(grid, atlas).join(", ")})`,
    `tile_set = ExtResource("1_tileset")`,
    "",
  ].join("\n");
}

/**
 * A Node2D with one TileMapLayer per layer, and a hidden "Collision" layer painted with the collision tiles: hiding it
 * keeps its physics, so it collides without drawing.
 */
export function tilemapSceneTscn({ tilemap, atlas }: Pick<TilemapExport, "tilemap" | "atlas">, tilesetFile: string): string {
  const names = uniqueNames([...tilemap.layers.map((layer) => nodeName(layer.name, "Layer")), "Collision"], "Layer");
  const layers = tilemap.layers.map((layer, i) => layerNode(names[i], layerCells(tilemap, atlas, i), atlas, layer.visible ? [] : ["visible = false"]));
  const collision = collisionCellGrid(tilemap, atlas);
  if (hasAnyCell(collision)) layers.push(layerNode(names[names.length - 1], collision, atlas, ["visible = false"]));
  return [
    `[gd_scene load_steps=2 format=3]\n`,
    `[ext_resource type="TileSet" path=${gdString(tilesetFile)} id="1_tileset"]\n`,
    `[node name=${gdString(nodeName(tilemap.name, "Tilemap"))} type="Node2D"]\ntexture_filter = 1\n`,
    ...layers,
  ].join("\n");
}

export function godotTilemapFiles(input: TilemapExport): ExportFile[] {
  const stem = fileStem(input.tilemap.name, "tilemap");
  return [
    { path: `${stem}/${stem}_tiles.png`, data: input.atlasPng },
    { path: `${stem}/${stem}_tileset.tres`, data: tileSetTres(input.tilemap, input.atlas, `${stem}_tiles.png`) },
    { path: `${stem}/${stem}.tscn`, data: tilemapSceneTscn(input, `${stem}_tileset.tres`) },
    { path: `${stem}/README.md`, data: godotTilemapReadme(input, stem) },
  ];
}
