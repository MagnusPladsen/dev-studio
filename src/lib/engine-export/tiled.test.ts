import { DOMParser } from "@xmldom/xmldom";
import { unzipSync, strFromU8 } from "fflate";
import { beforeAll, describe, expect, it } from "vitest";
import { runImporterOnFiles } from "@/lib/import";
import { textFile } from "@/lib/import/test-helpers";
import { fakeCodec, imageFile, makeImage } from "@/lib/import/image/test-images";
import { createTiledImporter } from "@/lib/import/tilemap/tiled";
import { collisionGrid } from "@/lib/tilemap/collision";
import { ENGINES, zipFiles } from ".";
import { layerCells } from "./tile-atlas";
import { tiledSpriteFiles, tiledTilemapFiles } from "./tiled";
import { CAVE, COIN, MEADOW, PIP, PLAIN, tilemapExport } from "./test-fixtures";
import { expectGolden, fileMap, textOf } from "./test-helpers";

beforeAll(() => {
  globalThis.DOMParser = DOMParser as unknown as typeof globalThis.DOMParser;
});

const xml = (text: string): Element => new globalThis.DOMParser().parseFromString(text, "application/xml").documentElement;
const elements = (root: Element, tag: string) => Array.from(root.getElementsByTagName(tag));

describe("Tiled sprite export", () => {
  it.each([PIP, COIN])("matches the golden files for $name", async (sprite) => {
    await expectGolden("tiled", tiledSpriteFiles(sprite));
  });

  it("animates the first tile of each tag with its frames and durations", () => {
    const tileset = xml(textOf(fileMap(tiledSpriteFiles(PIP)), "pip_walk/pip_walk.tsx"));
    expect(tileset.getAttribute("tilecount")).toBe("6");
    const animated = elements(tileset, "tile").map((tile) => ({
      id: tile.getAttribute("id"),
      frames: elements(tile, "frame").map((frame) => `${frame.getAttribute("tileid")}@${frame.getAttribute("duration")}`),
    }));
    // "walk" (2–5) and the reverse "walk_2" (from 2 played 4, 3, 2) start on different tiles; "hop" starts on 3
    expect(animated).toEqual([
      { id: "0", frames: ["0@1200", "1@150"] },
      { id: "2", frames: ["2@150", "3@150", "4@150", "5@150"] },
      { id: "3", frames: ["3@150", "4@150", "5@150", "4@150"] },
      { id: "4", frames: ["4@150", "3@150", "2@150"] },
    ]);
  });
});

describe("Tiled tilemap export", () => {
  it.each([MEADOW, CAVE, PLAIN])("matches the golden files for $name", async (tilemap) => {
    await expectGolden("tiled", tiledTilemapFiles(tilemapExport(tilemap)));
  });

  it("writes each terrain as a Wang set: edge for 16-tile terrains, mixed for 47-tile ones", () => {
    const input = tilemapExport(CAVE);
    const tileset = xml(textOf(fileMap(tiledTilemapFiles(input)), "crystal_cave/crystal_cave.tsx"));
    const sets = elements(tileset, "wangset").map((set) => ({
      name: set.getAttribute("name"),
      type: set.getAttribute("type"),
      tiles: elements(set, "wangtile").map((tile) => [Number(tile.getAttribute("tileid")), tile.getAttribute("wangid")]),
    }));
    const cellOf = (terrain: number, mask: number) => input.atlas.cells.findIndex((c) => c.terrain?.index === terrain && c.terrain.mask === mask);
    expect(sets.map((s) => [s.name, s.type, s.tiles.length])).toEqual([
      ["Rock", "edge", 3],
      ["Moss", "mixed", 3],
    ]);
    expect(sets[0].tiles).toContainEqual([cellOf(0, 6), "0,0,1,0,1,0,0,0"]);
    expect(sets[1].tiles).toContainEqual([cellOf(1, 28), "0,0,1,1,1,0,0,0"]);
    expect(sets[1].tiles).toContainEqual([cellOf(1, 255), "1,1,1,1,1,1,1,1"]);
  });

  it.each([MEADOW, CAVE, PLAIN])("imports $name back with the same tiles and collision", async (tilemap) => {
    const input = tilemapExport(tilemap);
    const files = fileMap(tiledTilemapFiles(input));
    const stem = [...files.keys()][0].split("/")[0];
    const image = imageFile(makeImage(input.atlas.columns * input.atlas.tileSize, input.atlas.rows * input.atlas.tileSize, () => [9, 9, 9, 255]), `${stem}_tiles.png`);
    for (const mapFile of [`${stem}.tmx`, `${stem}.tmj`]) {
      const outcome = await runImporterOnFiles(createTiledImporter(fakeCodec), [textFile(textOf(files, `${stem}/${mapFile}`), mapFile, ""), textFile(textOf(files, `${stem}/${stem}.tsx`), `${stem}.tsx`, ""), image], { skipMissing: false });
      if (!outcome.ok) throw new Error(outcome.message);
      const { tilemap: copy, sprites } = outcome.result.items[0];
      const cellOfSprite = new Map(sprites.map((sprite) => [sprite.id, Number(sprite.name.match(/(\d+)$/)![1])]));
      expect(copy.layers.map((layer) => [layer.name, layer.visible])).toEqual(tilemap.layers.map((layer) => [layer.name, layer.visible]));
      copy.layers.forEach((layer, i) => expect(layer.tiles.map((row) => row.map((tile) => (typeof tile === "string" ? cellOfSprite.get(tile)! : null)))).toEqual(layerCells(tilemap, input.atlas, i)));
      expect(copy.collision ?? null).toEqual(tilemap.collision ? collisionGrid(tilemap) : null);
    }
  });
});

describe("engine zips", () => {
  it("zips every engine's files with a README, and unzips to the same bytes", () => {
    for (const engine of ENGINES) {
      for (const files of [engine.sprite.files(PIP), engine.tilemap.files(tilemapExport(CAVE))]) {
        const unzipped = unzipSync(zipFiles(files));
        expect(Object.keys(unzipped)).toEqual(files.map((file) => file.path));
        expect(Object.keys(unzipped).some((path) => path.endsWith("/README.md"))).toBe(true);
        for (const file of files) {
          if (typeof file.data === "string") expect(strFromU8(unzipped[file.path])).toBe(file.data);
          else expect(unzipped[file.path]).toEqual(file.data);
        }
      }
    }
  });

  it("says free and no watermark in every README", () => {
    for (const engine of ENGINES) {
      for (const files of [engine.sprite.files(COIN), engine.tilemap.files(tilemapExport(PLAIN))]) {
        const readme = files.find((file) => file.path.endsWith("README.md"))!.data as string;
        expect(readme).toContain("Free to use in any project, no watermark");
      }
    }
  });
});
