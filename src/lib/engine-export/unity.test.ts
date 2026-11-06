import { describe, expect, it } from "vitest";
import { hashFileId, hashGuid, unitySpriteFiles, unityTilemapFiles } from "./unity";
import { CAVE, COIN, MEADOW, PIP, PLAIN, tilemapExport } from "./test-fixtures";
import { expectGolden, fileMap, textOf } from "./test-helpers";

/** The sliced sprites in a TextureImporter .meta: name, rect (y from the bottom) and fileID. */
function metaSprites(meta: string) {
  return [...meta.matchAll(/- serializedVersion: 2\n\s+name: (\S+)\n\s+rect:\n\s+serializedVersion: 2\n\s+x: (\d+)\n\s+y: (\d+)\n\s+width: (\d+)\n\s+height: (\d+)[\s\S]*?internalID: (\d+)/g)].map(
    ([, name, x, y, w, h, id]) => ({ name, rect: [x, y, w, h].map(Number), id })
  );
}

describe("Unity sprite export", () => {
  it.each([PIP, COIN])("matches the golden files for $name", async (sprite) => {
    await expectGolden("unity", unitySpriteFiles(sprite));
  });

  it("slices the sheet into one sprite per frame, rects measured from the bottom", () => {
    const meta = textOf(fileMap(unitySpriteFiles(PIP)), "pip_walk/pip_walk.png.meta");
    expect(meta).toMatch(/^fileFormatVersion: 2\nguid: [0-9a-f]{32}\n/);
    expect(meta).toContain("spriteMode: 2");
    expect(meta).toContain("filterMode: 0");
    expect(meta).toContain("textureCompression: 0");
    const sprites = metaSprites(meta);
    expect(sprites.map((s) => [s.name, s.rect])).toEqual([
      ["pip_walk_0", [0, 8, 8, 8]],
      ["pip_walk_1", [8, 8, 8, 8]],
      ["pip_walk_2", [16, 8, 8, 8]],
      ["pip_walk_3", [0, 0, 8, 8]],
      ["pip_walk_4", [8, 0, 8, 8]],
      ["pip_walk_5", [16, 0, 8, 8]],
    ]);
    for (const sprite of sprites) expect(meta).toContain(`      ${sprite.name}: ${sprite.id}`);
  });

  it("writes a looping clip per tag that keys the sheet's sprites at each frame's start", () => {
    const files = fileMap(unitySpriteFiles(PIP));
    expect([...files.keys()].filter((path) => path.endsWith(".anim"))).toEqual(["pip_walk/pip_walk_idle.anim", "pip_walk/pip_walk_walk.anim", "pip_walk/pip_walk_hop.anim", "pip_walk/pip_walk_walk_2.anim"]);
    const guid = textOf(files, "pip_walk/pip_walk.png.meta").match(/guid: (\w+)/)![1];
    const idle = textOf(files, "pip_walk/pip_walk_idle.anim");
    expect(idle).toMatch(/^%YAML 1\.1\n%TAG !u! tag:unity3d\.com,2011:\n--- !u!74 &7400000\nAnimationClip:/);
    const keys = [...idle.matchAll(/- time: ([\d.]+)\n\s+value: \{fileID: (\d+), guid: (\w+), type: 3\}/g)].map(([, time, id, g]) => ({ time: Number(time), id, g }));
    expect(keys.map((k) => k.time)).toEqual([0, 1.2, 1.35]);
    expect(keys.map((k) => k.id)).toEqual([hashFileId("pip_walk_0"), hashFileId("pip_walk_1"), hashFileId("pip_walk_1")]);
    expect(keys.every((k) => k.g === guid)).toBe(true);
    expect(idle).toContain("m_StopTime: 1.35");
    expect(idle).toContain("m_LoopTime: 1");
    expect(idle).toContain("attribute: m_Sprite");
  });

  it("makes stable 32-digit guids and positive fileIDs", () => {
    expect(hashGuid("a.png")).toMatch(/^[0-9a-f]{32}$/);
    expect(hashGuid("a.png")).toBe(hashGuid("a.png"));
    expect(hashGuid("a.png")).not.toBe(hashGuid("b.png"));
    expect(Number(hashFileId("x"))).toBeGreaterThan(0);
    expect(Number.isSafeInteger(Number(hashFileId("x")))).toBe(true);
  });
});

describe("Unity tilemap export", () => {
  it.each([MEADOW, CAVE, PLAIN])("matches the golden files for $name", async (tilemap) => {
    await expectGolden("unity", unityTilemapFiles(tilemapExport(tilemap)));
  });

  it("slices every atlas cell, names the collision tiles, and keeps the map as one sprite", () => {
    const input = tilemapExport(CAVE);
    const files = fileMap(unityTilemapFiles(input));
    const tiles = metaSprites(textOf(files, "crystal_cave/crystal_cave_tiles.png.meta"));
    expect(tiles).toHaveLength(input.atlas.cells.length);
    expect(tiles.slice(-2).map((t) => t.name)).toEqual(["crystal_cave_solid", "crystal_cave_one_way"]);
    const map = textOf(files, "crystal_cave/crystal_cave.png.meta");
    expect(map).toContain("spriteMode: 1");
    expect(map).toContain("spritePixelsToUnits: 8");
    expect(metaSprites(map)).toEqual([]);
  });

  it("writes the map as Tiled JSON with a Collision object layer", () => {
    const map = JSON.parse(textOf(fileMap(unityTilemapFiles(tilemapExport(CAVE))), "crystal_cave/crystal_cave.json"));
    expect(map.layers.map((layer: { name: string; type: string }) => [layer.name, layer.type])).toEqual([
      ["Rock", "tilelayer"],
      ["Secrets", "tilelayer"],
      ["Collision", "objectgroup"],
    ]);
  });
});
