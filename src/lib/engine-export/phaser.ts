import { APP } from "@/lib/app-config";
import { asepriteSheetJson } from "@/lib/sprite-animation";
import { fileStem, uniqueNames } from "./names";
import { phaserSpriteReadme, phaserTilemapReadme } from "./readmes";
import { tiledMapJson } from "./tiled-format";
import type { ExportFile, SpriteExport, TilemapExport } from "./types";

/**
 * Phaser 3: the sheet with Aseprite JSON for `this.load.aseprite` + `this.anims.createFromAseprite` (which looks frames
 * up by their index, so that is their name), and maps as Tiled JSON with a hidden "Collision" tile layer whose tiles
 * have a `collides` property, for `setCollisionByProperty({ collides: true })`.
 */

export function phaserAsepriteJson(sprite: SpriteExport, image: string): ReturnType<typeof asepriteSheetJson> {
  const names = uniqueNames(
    sprite.tags.map((tag) => tag.name),
    "animation"
  );
  return asepriteSheetJson({
    name: fileStem(sprite.name, "sprite"),
    image,
    width: sprite.width,
    height: sprite.height,
    durations: sprite.durations,
    tags: sprite.tags.map((tag, i) => ({ ...tag, name: names[i] })),
    app: APP.url,
    frameName: String,
  });
}

export function phaserSpriteFiles(sprite: SpriteExport): ExportFile[] {
  const stem = fileStem(sprite.name, "sprite");
  return [
    { path: `${stem}/${stem}.png`, data: sprite.sheetPng },
    { path: `${stem}/${stem}.json`, data: JSON.stringify(phaserAsepriteJson(sprite, `${stem}.png`), null, 2) },
    { path: `${stem}/README.md`, data: phaserSpriteReadme(sprite, stem) },
  ];
}

export function phaserTilemapFiles(input: TilemapExport): ExportFile[] {
  const stem = fileStem(input.tilemap.name, "tilemap");
  const map = tiledMapJson(input.tilemap, input.atlas, { image: `${stem}_tiles.png`, tilesetName: stem }, "tiles");
  return [
    { path: `${stem}/${stem}_tiles.png`, data: input.atlasPng },
    { path: `${stem}/${stem}.json`, data: JSON.stringify(map, null, 2) },
    { path: `${stem}/README.md`, data: phaserTilemapReadme(input, stem) },
  ];
}
