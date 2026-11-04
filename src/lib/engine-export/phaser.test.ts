import { describe, expect, it } from "vitest";
import { phaserSpriteFiles, phaserTilemapFiles } from "./phaser";
import { CAVE, COIN, MEADOW, PIP, PLAIN, tilemapExport } from "./test-fixtures";
import { expectGolden, fileMap, textOf } from "./test-helpers";

type AsepriteJson = {
  frames: { filename: string; frame: { x: number; y: number; w: number; h: number }; duration: number; rotated: boolean; trimmed: boolean; sourceSize: { w: number; h: number }; spriteSourceSize: object }[];
  meta: { image: string; size: { w: number; h: number }; frameTags: { name: string; from: number; to: number; direction: string }[] };
};

/** What Phaser 3's `AnimationManager.createFromAseprite` builds: frames are looked up by index and must exist in the atlas by that name. */
function createFromAseprite(data: AsepriteJson) {
  const atlasFrames = new Set(data.frames.map((frame) => frame.filename));
  return data.meta.frameTags.map((tag) => {
    const frames = [];
    for (let i = tag.from; i <= tag.to; i++) {
      const frame = data.frames[i];
      if (frame && atlasFrames.has(String(i))) frames.push({ frame: String(i), duration: frame.duration });
    }
    return { key: tag.name, direction: tag.direction, frames };
  });
}

const asepriteOf = (files: Map<string, string | Uint8Array>, path: string) => JSON.parse(textOf(files, path)) as AsepriteJson;

describe("Phaser 3 sprite export", () => {
  it.each([PIP, COIN])("matches the golden files for $name", async (sprite) => {
    await expectGolden("phaser", phaserSpriteFiles(sprite));
  });

  it("writes Aseprite's array format: frames with rects and durations, tags in meta", () => {
    const data = asepriteOf(fileMap(phaserSpriteFiles(PIP)), "pip_walk/pip_walk.json");
    expect(data.meta).toMatchObject({ image: "pip_walk.png", size: { w: 24, h: 16 }, format: "RGBA8888" });
    for (const frame of data.frames) {
      expect(Object.keys(frame).sort()).toEqual(["duration", "filename", "frame", "rotated", "sourceSize", "spriteSourceSize", "trimmed"]);
      expect(frame.frame.x + frame.frame.w).toBeLessThanOrEqual(data.meta.size.w);
      expect(frame.frame.y + frame.frame.h).toBeLessThanOrEqual(data.meta.size.h);
    }
    expect(data.frames.map((frame) => frame.duration)).toEqual(PIP.durations);
  });

  it("gives createFromAseprite every tag's frames with their durations, under unique names", () => {
    const animations = createFromAseprite(asepriteOf(fileMap(phaserSpriteFiles(PIP)), "pip_walk/pip_walk.json"));
    expect(animations.map((a) => [a.key, a.direction, a.frames.length])).toEqual([
      ["idle", "forward", 2],
      ["walk", "forward", 4],
      ["hop", "pingpong", 3],
      ["walk_2", "reverse", 3],
    ]);
    expect(animations[0].frames).toEqual([{ frame: "0", duration: 1200 }, { frame: "1", duration: 150 }]);
  });

  it("writes no tags for a sprite without them", () => {
    expect(asepriteOf(fileMap(phaserSpriteFiles(COIN)), "coin/coin.json").meta.frameTags).toEqual([]);
  });
});

describe("Phaser 3 tilemap export", () => {
  it.each([MEADOW, CAVE, PLAIN])("matches the golden files for $name", async (tilemap) => {
    await expectGolden("phaser", phaserTilemapFiles(tilemapExport(tilemap)));
  });

  it("embeds the tileset and adds a hidden Collision tile layer whose tiles have a collides property", () => {
    const input = tilemapExport(CAVE);
    const map = JSON.parse(textOf(fileMap(phaserTilemapFiles(input)), "crystal_cave/crystal_cave.json"));
    expect(map.tilesets).toHaveLength(1);
    expect(map.tilesets[0]).toMatchObject({ firstgid: 1, image: "crystal_cave_tiles.png", tilewidth: 8, columns: input.atlas.columns, tilecount: input.atlas.cells.length });
    const collision = map.layers.find((layer: { name: string }) => layer.name === "Collision");
    expect(collision).toMatchObject({ type: "tilelayer", visible: false, width: 4, height: 3 });
    const solid = input.atlas.collisionCells[1] + 1;
    const oneWay = input.atlas.collisionCells[2] + 1;
    expect(collision.data).toEqual([solid, solid, solid, solid, 0, oneWay, oneWay, 0, solid, solid, 0, 0]);
    const props = (id: number) => Object.fromEntries(map.tilesets[0].tiles.find((tile: { id: number }) => tile.id === id).properties.map((p: { name: string; value: unknown }) => [p.name, p.value]));
    expect(props(solid - 1)).toEqual({ collides: true, one_way: false });
    expect(props(oneWay - 1)).toEqual({ collides: true, one_way: true });
    expect(map.layers.some((layer: { type: string }) => layer.type === "objectgroup")).toBe(false);
  });

  it("has a data entry per cell in every tile layer", () => {
    for (const tilemap of [MEADOW, CAVE, PLAIN]) {
      const map = JSON.parse(textOf(fileMap(phaserTilemapFiles(tilemapExport(tilemap))), `${tilemap.name.toLowerCase().replace(/ /g, "_")}/${tilemap.name.toLowerCase().replace(/ /g, "_")}.json`));
      for (const layer of map.layers) expect(layer.data).toHaveLength(tilemap.width * tilemap.height);
    }
  });
});
