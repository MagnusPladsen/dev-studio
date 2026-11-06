import { APP } from "@/lib/app-config";
import { hasCollision } from "@/lib/tilemap/collision";
import { spriteAnimations } from "./names";
import type { SpriteExport, TilemapExport } from "./types";

/** The README in each engine zip: what each file is and how to load it. */

const footer = (): string => `---\nMade with ${APP.name} (${APP.url}). Free to use in any project, no watermark, no credit needed.\n`;

const fileTable = (rows: [string, string][]): string => ["| File | What it is |", "| --- | --- |", ...rows.map(([file, what]) => `| \`${file}\` | ${what} |`)].join("\n");

function animationList(sprite: SpriteExport): string {
  return spriteAnimations(sprite)
    .map((animation) => {
      const total = animation.durations.reduce((sum, ms) => sum + ms, 0);
      return `- \`${animation.name}\`: ${animation.frames.length} frame${animation.frames.length === 1 ? "" : "s"} (${animation.frames.join(", ")}), ${total} ms a loop`;
    })
    .join("\n");
}

const layerList = ({ tilemap }: TilemapExport): string => tilemap.layers.map((layer) => `\`${layer.name}\``).join(", ");

function tilemapFacts(input: TilemapExport): string {
  const { tilemap } = input;
  const terrains = (tilemap.terrains ?? []).map((terrain) => `\`${terrain.name}\` (${terrain.kind === "edge16" ? "16 tiles, sides" : "47 tiles, sides and corners"})`);
  return [
    `${tilemap.width} × ${tilemap.height} tiles of ${tilemap.tileSize} px. Layers: ${layerList(input)}.`,
    terrains.length ? `Auto-tile terrains: ${terrains.join(", ")}.` : "",
    hasCollision(tilemap.collision) ? "Has collision: solid cells and one-way platforms (solid from above only)." : "No collision painted.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function godotSpriteReadme(sprite: SpriteExport, stem: string): string {
  return `# ${sprite.name} for Godot 4

${fileTable([
  [`${stem}.png`, "The sprite sheet: every frame in a grid."],
  [`${stem}_frames.tres`, "A SpriteFrames resource with one animation per tag, each frame timed as in the editor."],
  [`${stem}.tscn`, "An AnimatedSprite2D scene using it, playing the first animation on start."],
])}

Animations:
${animationList(sprite)}

## Load it
1. Copy the \`${stem}\` folder anywhere into your Godot project.
2. Open or instance \`${stem}.tscn\`, or give any AnimatedSprite2D the \`${stem}_frames.tres\` resource.
3. Play an animation from code: \`$AnimatedSprite2D.play("${spriteAnimations(sprite)[0].name}")\`.

The scene sets Texture Filter to Nearest so pixels stay sharp. For the whole project, set
Project Settings > Rendering > Textures > Canvas Textures > Default Texture Filter to Nearest.

${footer()}`;
}

export function godotTilemapReadme(input: TilemapExport, stem: string): string {
  return `# ${input.tilemap.name} for Godot 4

${tilemapFacts(input)}

${fileTable([
  [`${stem}_tiles.png`, "Every tile the map uses, plus a red solid and a blue one-way collision tile at the end."],
  [`${stem}_tileset.tres`, "A TileSet: the tiles, terrain sets for auto-tiling, and physics layer 1 on the collision tiles."],
  [`${stem}.tscn`, "A Node2D with one TileMapLayer per layer, and a hidden Collision layer painted with the collision tiles."],
])}

## Load it
1. Copy the \`${stem}\` folder anywhere into your Godot project.
2. Open or instance \`${stem}.tscn\`.
3. Bodies on collision mask 1 now collide with the map. The Collision layer is hidden but still collides; show it
   in the editor to see or repaint it. One-way tiles only stop bodies falling onto them from above.
4. Auto-tiling: select a layer, open the TileMap panel's Terrains tab and paint with a terrain.

${footer()}`;
}

export function unitySpriteReadme(sprite: SpriteExport, stem: string, clips: string[]): string {
  return `# ${sprite.name} for Unity

${fileTable([
  [`${stem}.png`, "The sprite sheet: every frame in a grid."],
  [`${stem}.png.meta`, `Import settings: Sprite (Multiple), sliced into \`${stem}_0\`, \`${stem}_1\`…, Point filter, no compression.`],
  ...clips.map((clip): [string, string] => [clip, "An Animation Clip that loops the frames with their own durations."]),
])}

Animations:
${animationList(sprite)}

## Load it
1. Copy the \`${stem}\` folder into your project's \`Assets\` folder (keep the \`.meta\` file next to the PNG).
2. Drag a frame such as \`${stem}_0\` into the scene to make a Sprite Renderer.
3. Drag one of the \`.anim\` clips onto that object: Unity adds an Animator and plays the clip.

${footer()}`;
}

export function unityTilemapReadme(input: TilemapExport, stem: string): string {
  return `# ${input.tilemap.name} for Unity

${tilemapFacts(input)}

${fileTable([
  [`${stem}_tiles.png`, `The tiles, sliced into sprites \`${stem}_tile_<n>\` (Point filter), plus \`${stem}_solid\` and \`${stem}_one_way\` collision tiles.`],
  [`${stem}.png`, "The whole map as one picture, for a quick backdrop."],
  [`${stem}.json`, "The map in Tiled's JSON format: each layer's tiles and a Collision object layer of rectangles."],
])}

## Load it
1. Copy the \`${stem}\` folder into \`Assets\` (keep the \`.meta\` files next to the PNGs).
2. Quick look: drag \`${stem}.png\` into the scene. One tile is one unit.
3. To paint with the tiles: Window > 2D > Tile Palette, Create New Palette, then drag \`${stem}_tiles.png\` onto it.
4. To rebuild the layout and collision: in \`${stem}.json\`, each layer's \`data\` lists tiles row by row from the
   top-left; a number n means sprite \`${stem}_tile_<n-1>\` and 0 is empty. Collision rectangles are in pixels with y
   pointing down. Or open the JSON in Tiled (free), save it as .tmx and import that with SuperTiled2Unity.

${footer()}`;
}

export function phaserSpriteReadme(sprite: SpriteExport, stem: string): string {
  return `# ${sprite.name} for Phaser 3

${fileTable([
  [`${stem}.png`, "The sprite sheet: every frame in a grid."],
  [`${stem}.json`, "Aseprite-format data: frame positions, each frame's duration and the tags as animations."],
])}

Animations:
${animationList(sprite)}

## Load it
\`\`\`js
// preload()
this.load.aseprite("${stem}", "${stem}/${stem}.png", "${stem}/${stem}.json");

// create()
this.anims.createFromAseprite("${stem}");
this.add.sprite(100, 100, "${stem}").play({ key: "${spriteAnimations(sprite)[0].name}", repeat: -1 });
\`\`\`

Set \`pixelArt: true\` in your game config so the pixels stay sharp.

${footer()}`;
}

export function phaserTilemapReadme(input: TilemapExport, stem: string): string {
  const layers = input.tilemap.layers.map((layer) => `map.createLayer(${JSON.stringify(layer.name)}, tiles);`).join("\n");
  const collision = hasCollision(input.tilemap.collision)
    ? `
const collision = map.createLayer("Collision", tiles).setVisible(false);
collision.setCollisionByProperty({ collides: true });
// one-way platforms only block from above
collision.forEachTile((tile) => tile.properties.one_way && tile.setCollision(false, false, true, false));
this.physics.add.collider(player, collision);`
    : "";
  return `# ${input.tilemap.name} for Phaser 3

${tilemapFacts(input)}

${fileTable([
  [`${stem}_tiles.png`, "The tileset image, plus a solid and a one-way collision tile at the end."],
  [`${stem}.json`, "The map in Tiled's JSON format with the tileset embedded. Collision is a hidden \`Collision\` tile layer whose tiles have \`collides\` and \`one_way\` properties."],
])}

## Load it
\`\`\`js
// preload()
this.load.tilemapTiledJSON("${stem}", "${stem}/${stem}.json");
this.load.image("${stem}_tiles", "${stem}/${stem}_tiles.png");

// create()
const map = this.make.tilemap({ key: "${stem}" });
const tiles = map.addTilesetImage("${stem}", "${stem}_tiles");
${layers}${collision}
\`\`\`

Set \`pixelArt: true\` in your game config so the pixels stay sharp.

${footer()}`;
}

export function tiledSpriteReadme(sprite: SpriteExport, stem: string): string {
  return `# ${sprite.name} for Tiled

${fileTable([
  [`${stem}.png`, "The sprite sheet: every frame in a grid."],
  [`${stem}.tsx`, "A Tiled tileset of the frames. Each animation plays on the tile of its first frame, which has an \`animation\` property with its name."],
])}

Animations:
${animationList(sprite)}

## Load it
In Tiled, open a map, then Map > Add External Tileset… and pick \`${stem}.tsx\`. Place an animated tile and it plays in
Tiled and in engines that read Tiled tile animations.

${footer()}`;
}

export function tiledTilemapReadme(input: TilemapExport, stem: string): string {
  return `# ${input.tilemap.name} for Tiled

${tilemapFacts(input)}

${fileTable([
  [`${stem}.tmx`, "The map (Tiled XML), using the tileset below."],
  [`${stem}.tsx`, "The tileset: the tiles, terrains as Wang sets, and two collision tiles with a \`collides\` property."],
  [`${stem}_tiles.png`, "The tileset image."],
  [`${stem}.tmj`, "The same map as Tiled JSON with the tileset embedded, for engines that read JSON."],
])}

## Load it
Open \`${stem}.tmx\` in Tiled (free, mapeditor.org). Collision is the \`Collision\` object layer: rectangles of type
\`solid\` or \`one_way\`, each with a \`one_way\` bool property. Terrains are in the Terrain Sets panel; paint with them
using the Terrain Brush.

${footer()}`;
}
