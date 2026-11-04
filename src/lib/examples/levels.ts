import type { ExampleContext, ExampleModule } from "./types";

// Example assets for: tilemaps, spritesheets, palettes.

const W = 32;
const H = 18;

type Tile = string | null;

function grid(): Tile[][] {
  return Array.from({ length: H }, () => new Array<Tile>(W).fill(null));
}

function fill(g: Tile[][], tile: string, x0: number, x1: number, y0: number, y1: number) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) g[y][x] = tile;
}

/** "Ground" auto-tiles grass on top (no ground above) and dirt below: the 16-tile kind, keyed by neighbour mask. */
function groundTerrain(ctx: ExampleContext, grass: string, dirt: string) {
  const NORTH = 1;
  const tiles = Object.fromEntries(Array.from({ length: 16 }, (_, mask) => [mask, mask & NORTH ? dirt : grass]));
  return { id: ctx.id("meadow-terrain-ground"), name: "Ground", kind: "edge16" as const, tiles };
}

/** Solid ground and pond bed, one-way floating platforms, and water you can fall into. */
function meadowCollision(ground: Tile[][], water: string, platforms: [number, number, number][]): number[][] {
  const collision = ground.map((row) => row.map((tile): number => (tile && tile !== water ? 1 : 0)));
  for (const [x0, x1, y] of platforms) for (let x = x0; x <= x1; x++) collision[y][x] = 2;
  return collision;
}

/** "Mossbrook Meadow": a short level that walks from the village edge, over a pond, up a hill to a chest. */
function meadow(ctx: ExampleContext) {
  const grass = ctx.id("tile-grass");
  const dirt = ctx.id("tile-dirt");
  const stone = ctx.id("tile-stone");
  const water = ctx.id("tile-water");

  const ground = grid();
  // main ground: grass surface on row 13, dirt below
  fill(ground, grass, 0, 16, 13, 13);
  fill(ground, dirt, 0, 16, 14, 17);
  // pond: two rows of water on a stone bed
  fill(ground, water, 17, 22, 14, 15);
  fill(ground, stone, 17, 22, 16, 17);
  // far bank
  fill(ground, grass, 23, 24, 13, 13);
  fill(ground, dirt, 23, 24, 14, 17);
  // a step, then a hill
  fill(ground, grass, 25, 25, 12, 12);
  fill(ground, dirt, 25, 25, 13, 17);
  fill(ground, grass, 26, 31, 11, 11);
  fill(ground, dirt, 26, 31, 12, 17);
  // floating stone platforms
  const platforms: [number, number, number][] = [[6, 9, 9], [12, 14, 7], [18, 21, 10]];
  for (const [x0, x1, y] of platforms) fill(ground, stone, x0, x1, y, y);

  const objects = grid();
  const hero = ctx.id("hero");
  const coin = ctx.id("coin");
  const slime = ctx.id("slime");
  const chest = ctx.id("chest");
  objects[12][2] = hero;
  objects[8][7] = coin;
  objects[8][8] = coin;
  objects[6][13] = coin;
  objects[9][19] = coin;
  objects[9][20] = coin;
  objects[12][11] = slime;
  objects[10][27] = slime;
  objects[10][30] = chest;

  return {
    id: ctx.id("meadow"),
    name: "Mossbrook Meadow",
    width: W,
    height: H,
    tileSize: 16,
    layers: [
      { id: ctx.id("meadow-layer-ground"), name: "Ground", visible: true, tiles: ground },
      { id: ctx.id("meadow-layer-objects"), name: "Objects", visible: true, tiles: objects },
    ],
    tilesetSpriteIds: [grass, dirt, stone, water, hero, coin, slime, chest],
    terrains: [groundTerrain(ctx, grass, dirt)],
    collision: meadowCollision(ground, water, platforms),
    tags: ["level", "platformer"],
  };
}

export const levelExamples: ExampleModule[] = [
  {
    collection: "tilemaps",
    build: (ctx) => [meadow(ctx)],
  },
  {
    collection: "spritesheets",
    build: (ctx) => [
      {
        id: ctx.id("characters"),
        name: "Characters",
        spriteIds: [ctx.id("hero"), ctx.id("slime"), ctx.id("coin")],
        padding: 1,
        powerOfTwo: false,
      },
    ],
  },
  {
    collection: "palettes",
    build: (ctx) => [
      {
        id: ctx.id("meadow-palette"),
        name: "Mossbrook Meadow",
        colors: [
          "#1b1f2a", // outline
          "#cfefff", // pale sky
          "#8fd3ff", // sky
          "#f4f7ff", // cloud
          "#7ac74f", // grass light
          "#4f9d3a", // grass
          "#2f6b2e", // grass shadow
          "#a9744f", // dirt light
          "#6b4430", // dirt
          "#8b8f98", // stone
          "#3a8fd9", // water
          "#235a9c", // deep water
          "#f6c445", // gold
        ],
      },
      {
        id: ctx.id("dungeon-palette"),
        name: "Dungeon",
        colors: [
          "#14141c", // void
          "#262635", // deep stone
          "#3b3b52", // stone
          "#5a5a75", // stone light
          "#8a8aa6", // highlight
          "#4d6b3a", // moss
          "#7a9a4a", // moss light
          "#ff8a2a", // torch
          "#ffd166", // flame
          "#9e2835", // banner red
        ],
      },
    ],
  },
];
