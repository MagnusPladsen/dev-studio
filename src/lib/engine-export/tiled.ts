import { fileStem, spriteAnimations } from "./names";
import { tiledSpriteReadme, tiledTilemapReadme } from "./readmes";
import { TILED_VERSION, tiledMapJson, tiledMapXml, tiledTilesetXml, xmlEscape } from "./tiled-format";
import type { ExportFile, SpriteExport, TilemapExport } from "./types";

/**
 * A sprite as a Tiled tileset of its frames, where each animation plays on its first frame's tile (Tiled animates
 * tiles, so placing that tile on a map shows the animation). Tiles that start two animations keep the first.
 */
export function spriteTilesetXml(sprite: SpriteExport, image: string): string {
  const animated = new Map<number, ReturnType<typeof spriteAnimations>[number]>();
  for (const animation of spriteAnimations(sprite)) if (!animated.has(animation.frames[0])) animated.set(animation.frames[0], animation);
  const lines = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<tileset version="${TILED_VERSION}" name="${xmlEscape(fileStem(sprite.name, "sprite"))}" tilewidth="${sprite.width}" tileheight="${sprite.height}" tilecount="${sprite.durations.length}" columns="${sprite.columns}">`,
    ` <image source="${xmlEscape(image)}" width="${sprite.columns * sprite.width}" height="${sprite.rows * sprite.height}"/>`,
  ];
  for (const [tile, animation] of [...animated].sort((a, b) => a[0] - b[0])) {
    lines.push(` <tile id="${tile}">`, `  <properties>`, `   <property name="animation" value="${xmlEscape(animation.name)}"/>`, `  </properties>`, `  <animation>`);
    animation.frames.forEach((frame, i) => lines.push(`   <frame tileid="${frame}" duration="${animation.durations[i]}"/>`));
    lines.push(`  </animation>`, ` </tile>`);
  }
  lines.push("</tileset>", "");
  return lines.join("\n");
}

export function tiledSpriteFiles(sprite: SpriteExport): ExportFile[] {
  const stem = fileStem(sprite.name, "sprite");
  return [
    { path: `${stem}/${stem}.png`, data: sprite.sheetPng },
    { path: `${stem}/${stem}.tsx`, data: spriteTilesetXml(sprite, `${stem}.png`) },
    { path: `${stem}/README.md`, data: tiledSpriteReadme(sprite, stem) },
  ];
}

export function tiledTilemapFiles(input: TilemapExport): ExportFile[] {
  const { tilemap, atlas } = input;
  const stem = fileStem(tilemap.name, "tilemap");
  const names = { image: `${stem}_tiles.png`, tilesetName: stem };
  return [
    { path: `${stem}/${stem}_tiles.png`, data: input.atlasPng },
    { path: `${stem}/${stem}.tsx`, data: tiledTilesetXml(tilemap, atlas, names) },
    { path: `${stem}/${stem}.tmx`, data: tiledMapXml(tilemap, atlas, `${stem}.tsx`, "objects") },
    { path: `${stem}/${stem}.tmj`, data: JSON.stringify(tiledMapJson(tilemap, atlas, names, "objects"), null, 2) },
    { path: `${stem}/README.md`, data: tiledTilemapReadme(input, stem) },
  ];
}
