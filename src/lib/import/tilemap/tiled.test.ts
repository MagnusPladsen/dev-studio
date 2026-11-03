import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DOMParser } from "@xmldom/xmldom";
import { beforeAll, describe, expect, it } from "vitest";
import type { TilemapData } from "@/types";
import { levelExamples } from "@/lib/examples/levels";
import { devStudioExamples } from "@/lib/examples/dev-studio";
import { toTiledJson } from "@/lib/tilemap/tiled-export";
import { runImporterOnFiles } from "@/lib/import";
import { differenceIgnoringIds, textFile } from "@/lib/import/test-helpers";
import { decodeFake, fakeCodec, imageFile, makeImage, pixelAt } from "@/lib/import/image/test-images";
import { createTiledImporter } from "./tiled";

const importer = createTiledImporter(fakeCodec);

/** A tileset image whose pixels say where they are: red = x, green = y. */
const image = (name: string, width = 64, height = 64) => imageFile(makeImage(width, height, (x, y) => [x, y, 0, 255]), name);

/** `.tsx` fixtures are stored as `.tsx.xml` so TypeScript doesn't read them as code. */
const fixture = (name: string) => textFile(readFileSync(fileURLToPath(new URL(`./fixtures/${name.replace(/\.tsx$/, ".tsx.xml")}`, import.meta.url)), "utf8"), name, "");
async function importMap(file: File, files: File[] = [], skipMissing = false) {
  return runImporterOnFiles(importer, [file, ...files], { skipMissing });
}

/** Where a sprite was cut from: its size and the source pixel at its top-left. */
const cutOf = (pixels: string) => {
  const tile = decodeFake(pixels);
  const [x, y] = pixelAt(tile, 0, 0);
  return `${x},${y} ${tile.width}x${tile.height}`;
};

async function importOk(file: File, files: File[] = [], skipMissing = false) {
  const outcome = await importMap(file, files, skipMissing);
  if (!outcome.ok) throw new Error(outcome.message);
  return { ...outcome.result.items[0], warnings: outcome.result.warnings };
}

/** Each cell as the sprite's name, a basic tile index, or "." when empty. */
function cells(tilemap: TilemapData, layer: number, spriteNames: Map<string, string>) {
  return tilemap.layers[layer].tiles.map((row) => row.map((tile) => (tile === null ? "." : typeof tile === "number" ? tile : spriteNames.get(tile) ?? "?")));
}

beforeAll(() => {
  globalThis.DOMParser = DOMParser as unknown as typeof globalThis.DOMParser;
});

describe("Tiled import: JSON with external tilesets", () => {
  const companions = () => [fixture("terrain.tsj"), fixture("items.tsx"), image("terrain.png", 36, 36), image("chest.png", 16, 16), image("key.png", 8, 8)];

  it("slices the tileset image by tile size, spacing and margin, and image collections per tile", async () => {
    const { tilemap, sprites, warnings } = await importOk(fixture("village.tmj"), companions());
    const names = new Map(sprites.map((sprite) => [sprite.id, sprite.name]));
    expect(tilemap).toMatchObject({ name: "village", width: 3, height: 2, tileSize: 16 });
    expect(cells(tilemap, 0, names)).toEqual([["Terrain 0", "Terrain 1", "Terrain 0"], ["Terrain 3", "Terrain 3", "Terrain 3"]]);
    expect(cells(tilemap, 1, names)).toEqual([[".", "Items 1", "."], [".", ".", "Items 0"]]);
    const pixels = new Map(sprites.map((sprite) => [sprite.name, sprite.frames[0].pixels]));
    expect(cutOf(pixels.get("Terrain 3")!)).toBe("19,19 16x16");
    expect(cutOf(pixels.get("Items 1")!)).toBe("0,0 8x8");
    expect(sprites.find((sprite) => sprite.name === "Items 1")).toMatchObject({ width: 8, height: 8, tags: ["tileset"] });
    expect(new Set(tilemap.tilesetSpriteIds)).toEqual(new Set(sprites.map((sprite) => sprite.id)));
    expect(warnings).toEqual([
      "Made 5 sprites from the tileset tiles this map uses.",
      'The Tilemap has no object or image layers, so these were skipped: "Collision" (objects).',
    ]);
  });

  it("asks for external tilesets, then for their images", async () => {
    expect(await importMap(fixture("village.tmj"))).toMatchObject({ ok: false, missing: ["terrain.tsj", "items.tsx"] });
    expect(await importMap(fixture("village.tmj"), [fixture("terrain.tsj"), fixture("items.tsx")])).toMatchObject({
      ok: false,
      missing: ["terrain.png", "chest.png", "key.png"],
    });
  });

  it("imports without missing files when asked, leaving their tiles empty", async () => {
    const { tilemap, sprites, warnings } = await importOk(fixture("village.tmj"), [fixture("terrain.tsj"), image("TERRAIN.png")], true);
    const names = new Map(sprites.map((sprite) => [sprite.id, sprite.name]));
    expect(cells(tilemap, 1, names)).toEqual([[".", ".", "."], [".", ".", "."]]);
    expect(warnings).toContain("Left out tiles from missing files: items.tsx.");
    expect(warnings).toContain("2 tiles had no tileset image and were left empty.");
  });
});

describe("Tiled import: TMX", () => {
  it("reads zlib, gzip, plain base64, CSV and XML tile data, groups and flips", async () => {
    const { tilemap, sprites, warnings } = await importOk(fixture("cave.tmx"), [image("cave.png")]);
    const names = new Map(sprites.map((sprite) => [sprite.id, sprite.name]));
    expect(tilemap.layers.map((layer) => [layer.name, layer.visible])).toEqual([
      ["Ground", true],
      ["Decor", false],
      ["Overlay", true],
      ["Walls", true],
      ["Old style", true],
    ]);
    expect(cells(tilemap, 0, names)).toEqual([["Cave 0", "Cave 0", "Cave 1", "Cave 1"], ["Cave 2", "Cave 2", "Cave 2", "Cave 2"]]);
    expect(cells(tilemap, 1, names)).toEqual([[".", "Cave 3", ".", "Cave 3"], [".", ".", ".", "."]]);
    expect(cells(tilemap, 2, names)).toEqual([[".", ".", "Cave 0", "."], [".", ".", ".", "."]]);
    expect(cells(tilemap, 3, names)).toEqual([["Cave 3", ".", ".", "Cave 3"], [".", ".", ".", "."]]);
    expect(cells(tilemap, 4, names)).toEqual([["Cave 1", ".", ".", "."], [".", ".", ".", "Cave 2"]]);
    expect(cutOf(sprites.find((sprite) => sprite.name === "Cave 3")!.frames[0].pixels)).toBe("8,8 8x8");
    expect(warnings).toContain("1 tile was flipped or rotated; the Tilemap has no flips, so it faces the default way.");
    expect(warnings).toContain('The Tilemap has no object or image layers, so these were skipped: "Spawns" (objects).');
  });

  it("explains Zstandard data", async () => {
    const text = readFileSync(fileURLToPath(new URL("./fixtures/cave.tmx", import.meta.url)), "utf8").replace('compression="zlib"', 'compression="zstd"');
    const outcome = await importMap(textFile(text, "cave.tmx", ""), [image("cave.png")]);
    expect(outcome).toMatchObject({ ok: false, message: expect.stringContaining("Zstandard") });
  });
});

describe("Tiled import: several files at once", () => {
  it("imports every map among the files and treats .json tilesets as companions", async () => {
    const tileset = textFile(readFileSync(fileURLToPath(new URL("./fixtures/terrain.tsj", import.meta.url)), "utf8"), "terrain.json");
    const map = textFile(JSON.stringify({ ...JSON.parse(await fixture("village.tmj").text()), tilesets: [{ firstgid: 1, source: "terrain.json" }] }), "village.json");
    const outcome = await runImporterOnFiles(importer, [map, tileset, image("terrain.png", 36, 36), fixture("island.tmj"), image("sand.png", 16, 16)]);
    if (!outcome.ok) throw new Error(outcome.message);
    expect(outcome.result.items.map((item) => item.tilemap.name)).toEqual(["village", "island"]);
  });
});

describe("Tiled import: infinite maps", () => {
  it("flattens chunks to the tiles in use", async () => {
    const { tilemap, warnings } = await importOk(fixture("island.tmj"), [image("sand.png")]);
    expect([tilemap.width, tilemap.height]).toEqual([3, 1]);
    expect(tilemap.layers[0].tiles[0].every((tile) => typeof tile === "string")).toBe(true);
    expect(warnings).toContain("This was an infinite map; it was cut to the 3×1 tiles in use.");
  });
});

describe("Tiled import: files it can't use", () => {
  const map = (changes: Record<string, unknown>) =>
    textFile(JSON.stringify({ orientation: "orthogonal", width: 1, height: 1, tilewidth: 16, tileheight: 16, layers: [], tilesets: [], ...changes }), "map.tmj");

  it.each(["isometric", "hexagonal", "staggered"])("refuses %s maps", async (orientation) => {
    expect(await importMap(map({ orientation }))).toMatchObject({ ok: false, message: expect.stringContaining("Only orthogonal") });
  });

  it("refuses maps bigger than the Tilemap allows", async () => {
    const data = new Array(300).fill(0);
    const outcome = await importMap(map({ width: 300, layers: [{ name: "Wide", type: "tilelayer", data }] }));
    expect(outcome).toMatchObject({ ok: false, message: "This map is 300×1 tiles. Maps up to 256×256 can be imported." });
  });

  it("refuses files that are too big", async () => {
    const file = map({});
    Object.defineProperty(file, "size", { value: 25 * 1024 * 1024 });
    expect(await importMap(file)).toMatchObject({ ok: false, message: '"map.tmj" is too big (25 MB). The limit is 20 MB.' });
  });

  it("explains broken and wrong files", async () => {
    expect(await importMap(textFile("not a map", "map.tmj"))).toMatchObject({ ok: false, message: expect.stringContaining("isn't valid JSON") });
    expect(await importMap(textFile("{}", "map.json"))).toMatchObject({ ok: false, message: "This isn't a Tiled map." });
    expect(await importMap(textFile("<map", "map.tmx"))).toMatchObject({ ok: false, message: expect.stringContaining("isn't valid XML") });
    expect(await importMap(fixture("terrain.tsj"))).toMatchObject({ ok: false, message: expect.stringContaining("Add a Tiled map") });
    expect(await importMap(map({ width: 2, layers: [{ name: "Short", type: "tilelayer", data: [1] }] }))).toMatchObject({
      ok: false,
      message: `Layer "Short" doesn't have 2×1 tiles.`,
    });
  });
});

describe("Tiled import: the Tilemap's own JSON export", () => {
  const ctx = { projectId: "p", id: (slug: string) => `p--ex--${slug}` };
  const exampleTilemaps = [...levelExamples, ...devStudioExamples]
    .filter((module) => module.collection === "tilemaps")
    .flatMap((module) => module.build(ctx) as unknown as TilemapData[]);
  const handMade: TilemapData = {
    id: "m",
    projectId: "p",
    name: "Colours",
    width: 3,
    height: 2,
    tileSize: 8,
    layers: [
      { id: "a", name: "Base", visible: true, tiles: [[0, 15, null], [7, "sprite-1", 0]] },
      { id: "b", name: "Hidden", visible: false, tiles: [[null, null, "sprite-2"], [null, null, null]] },
    ],
    tilesetSpriteIds: ["sprite-1", "sprite-2"],
    tags: [],
    createdAt: "",
    updatedAt: "",
  };
  const comparable = ({ name, width, height, tileSize, layers }: TilemapData) => ({ name, width, height, tileSize, layers });

  it.each([...exampleTilemaps, handMade].map((tilemap) => [tilemap.name, tilemap] as const))("round-trips %s losslessly", async (_name, tilemap) => {
    const exported = textFile(JSON.stringify(toTiledJson(tilemap, () => "Sprite"), null, 2), `${tilemap.name}.json`);
    const { tilemap: copy, sprites, warnings } = await importOk(exported);
    expect(warnings).toEqual([]);
    expect(sprites).toEqual([]);
    expect(differenceIgnoringIds(comparable(tilemap), comparable(copy))).toBeNull();
    expect(new Set(copy.tilesetSpriteIds)).toEqual(new Set(tilemap.layers.flatMap((layer) => layer.tiles.flat()).filter((tile) => typeof tile === "string")));
    expect(copy.layers.map((layer) => layer.id)).not.toContain(tilemap.layers[0].id);
  });

  it("covers every example tilemap", () => {
    expect(exampleTilemaps.length).toBeGreaterThanOrEqual(1);
  });
});
