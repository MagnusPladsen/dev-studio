import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { godotSpriteFiles, godotTilemapFiles, gdFloat, nodeName } from "./godot";
import { cellCoords, layerCells } from "./tile-atlas";
import { CAVE, COIN, MEADOW, PIP, PLAIN, tilemapExport } from "./test-fixtures";
import { expectGolden, fileMap, textOf } from "./test-helpers";

/** A Godot text resource split into its [sections], each with its header attributes and `key = value` lines. */
interface GodotSection {
  tag: string;
  attrs: Record<string, string>;
  props: Record<string, string>;
}

function parseGodotText(text: string): GodotSection[] {
  const sections: GodotSection[] = [];
  let lastKey = "";
  for (const line of text.split("\n")) {
    const header = line.match(/^\[(\w+)(.*)\]$/);
    if (header) {
      const attrs = Object.fromEntries([...header[2].matchAll(/(\w+)=("[^"]*"|\S+)/g)].map((m) => [m[1], m[2].replace(/^"|"$/g, "")]));
      sections.push({ tag: header[1], attrs, props: {} });
      continue;
    }
    const prop = line.match(/^([\w/:]+) = (.*)$/);
    const section = sections[sections.length - 1];
    if (prop && section) {
      lastKey = prop[1];
      section.props[lastKey] = prop[2];
    } else if (section && lastKey && line) section.props[lastKey] += `\n${line}`;
  }
  return sections;
}

/** Every ExtResource/SubResource id used is declared, and every ext_resource path is a file in the same folder. */
function expectResolvable(sections: GodotSection[], path: string, files: Map<string, unknown>) {
  const folder = dirname(path);
  const extIds = new Set(sections.filter((s) => s.tag === "ext_resource").map((s) => s.attrs.id));
  const subIds = new Set(sections.filter((s) => s.tag === "sub_resource").map((s) => s.attrs.id));
  for (const ext of sections.filter((s) => s.tag === "ext_resource")) expect(files.has(join(folder, ext.attrs.path))).toBe(true);
  const body = sections.flatMap((s) => Object.values(s.props)).join("\n");
  for (const [, id] of body.matchAll(/ExtResource\("([^"]+)"\)/g)) expect(extIds).toContain(id);
  for (const [, id] of body.matchAll(/SubResource\("([^"]+)"\)/g)) expect(subIds).toContain(id);
  expect(sections[0].tag).toMatch(/^gd_(resource|scene)$/);
  expect(sections[0].attrs.format).toBe("3");
}

/** The `animations` array of a SpriteFrames, read as JSON (Godot's StringName `&"x"` becomes a plain string). */
function animationsOf(tres: string) {
  const resource = parseGodotText(tres).find((s) => s.tag === "resource")!;
  const json = resource.props.animations.replace(/&"/g, '"').replace(/SubResource\("([^"]+)"\)/g, '"$1"');
  return JSON.parse(json) as { name: string; speed: number; loop: boolean; frames: { duration: number; texture: string }[] }[];
}

describe("Godot 4 sprite export", () => {
  it.each([PIP, COIN])("matches the golden files for $name", async (sprite) => {
    await expectGolden("godot", godotSpriteFiles(sprite));
  });

  it("writes an animation per tag with each frame's duration relative to the speed", () => {
    const files = fileMap(godotSpriteFiles(PIP));
    const animations = animationsOf(textOf(files, "pip_walk/pip_walk_frames.tres"));
    expect(animations.map((a) => a.name)).toEqual(["idle", "walk", "hop", "walk_2"]);
    const played = (a: (typeof animations)[number]) => a.frames.map((f) => ({ texture: f.texture, ms: Math.round((f.duration / a.speed) * 1000) }));
    expect(played(animations[0])).toEqual([{ texture: "AtlasTexture_0", ms: 1200 }, { texture: "AtlasTexture_1", ms: 150 }]);
    expect(played(animations[2]).map((f) => f.texture)).toEqual(["AtlasTexture_3", "AtlasTexture_4", "AtlasTexture_5", "AtlasTexture_4"]);
    expect(played(animations[3]).map((f) => f.texture)).toEqual(["AtlasTexture_4", "AtlasTexture_3", "AtlasTexture_2"]);
    expect(animations.every((a) => a.loop)).toBe(true);
  });

  it("gives a sprite without tags one default animation at its fps", () => {
    const animations = animationsOf(textOf(fileMap(godotSpriteFiles(COIN)), "coin/coin_frames.tres"));
    expect(animations).toHaveLength(1);
    expect(animations[0]).toMatchObject({ name: "default", speed: 8 });
    expect(animations[0].frames.map((f) => f.duration)).toEqual([1, 1, 1, 1]);
  });

  it("references only files and resources that exist", () => {
    const files = fileMap(godotSpriteFiles(PIP));
    for (const path of ["pip_walk/pip_walk_frames.tres", "pip_walk/pip_walk.tscn"]) expectResolvable(parseGodotText(textOf(files, path)), path, files);
    const frames = parseGodotText(textOf(files, "pip_walk/pip_walk_frames.tres")).filter((s) => s.tag === "sub_resource");
    expect(frames.map((s) => s.props.region)).toEqual(["Rect2(0, 0, 8, 8)", "Rect2(8, 0, 8, 8)", "Rect2(16, 0, 8, 8)", "Rect2(0, 8, 8, 8)", "Rect2(8, 8, 8, 8)", "Rect2(16, 8, 8, 8)"]);
    const scene = parseGodotText(textOf(files, "pip_walk/pip_walk.tscn"));
    expect(scene[2]).toMatchObject({ tag: "node", attrs: { name: "PipWalk", type: "AnimatedSprite2D" }, props: { animation: '&"idle"', autoplay: '"idle"' } });
  });
});

describe("Godot 4 tilemap export", () => {
  it.each([MEADOW, CAVE, PLAIN])("matches the golden files for $name", async (tilemap) => {
    await expectGolden("godot", godotTilemapFiles(tilemapExport(tilemap)));
  });

  it("references only files and resources that exist", () => {
    for (const tilemap of [MEADOW, CAVE, PLAIN]) {
      const files = fileMap(godotTilemapFiles(tilemapExport(tilemap)));
      for (const path of [...files.keys()].filter((p) => /\.(tres|tscn)$/.test(p))) expectResolvable(parseGodotText(textOf(files, path)), path, files);
    }
  });

  it("puts each terrain slot's neighbours into peering bits, one terrain set per kind", () => {
    const input = tilemapExport(CAVE);
    const tileset = parseGodotText(textOf(fileMap(godotTilemapFiles(input)), "crystal_cave/crystal_cave_tileset.tres"));
    const resource = tileset.find((s) => s.tag === "resource")!.props;
    expect(resource).toMatchObject({ "terrain_set_0/mode": "2", "terrain_set_0/terrain_0/name": '"Rock"', "terrain_set_1/mode": "0", "terrain_set_1/terrain_0/name": '"Moss"' });
    const atlas = tileset.find((s) => s.tag === "sub_resource")!.props;
    // Rock slot for mask 6 (E + S) and Moss slot for mask 28 (E, SE, S)
    const rock6 = input.atlas.cells.findIndex((c) => c.terrain?.index === 0 && c.terrain.mask === 6);
    const moss28 = input.atlas.cells.findIndex((c) => c.terrain?.index === 1 && c.terrain.mask === 28);
    const bits = (index: number) => {
      const { x, y } = cellCoords(input.atlas, index);
      return Object.keys(atlas).filter((k) => k.startsWith(`${x}:${y}/0/terrains_peering_bit/`)).map((k) => k.split("/").pop());
    };
    expect(bits(rock6)).toEqual(["right_side", "bottom_side"]);
    expect(bits(moss28)).toEqual(["right_side", "bottom_right_corner", "bottom_side"]);
  });

  it("gives the collision tiles a square polygon, one-way on the platform tile", () => {
    const input = tilemapExport(CAVE);
    const atlas = parseGodotText(textOf(fileMap(godotTilemapFiles(input)), "crystal_cave/crystal_cave_tileset.tres")).find((s) => s.tag === "sub_resource")!.props;
    const at = (index: number) => {
      const { x, y } = cellCoords(input.atlas, index);
      return `${x}:${y}/0/physics_layer_0/polygon_0`;
    };
    expect(atlas[`${at(input.atlas.collisionCells[1])}/points`]).toBe("PackedVector2Array(-4, -4, 4, -4, 4, 4, -4, 4)");
    expect(atlas[`${at(input.atlas.collisionCells[1])}/one_way`]).toBeUndefined();
    expect(atlas[`${at(input.atlas.collisionCells[2])}/one_way`]).toBe("true");
  });

  it("encodes each layer's cells in tile_map_data, with a hidden collision layer", () => {
    const input = tilemapExport(CAVE);
    const scene = parseGodotText(textOf(fileMap(godotTilemapFiles(input)), "crystal_cave/crystal_cave.tscn"));
    const nodes = scene.filter((s) => s.tag === "node");
    expect(nodes.map((n) => [n.attrs.name, n.attrs.type, n.props.visible])).toEqual([
      ["CrystalCave", "Node2D", undefined],
      ["Rock", "TileMapLayer", undefined],
      ["Secrets", "TileMapLayer", "false"],
      ["Collision", "TileMapLayer", "false"],
    ]);
    const bytes = nodes[1].props.tile_map_data.match(/\((.*)\)/)![1].split(", ").map(Number);
    const cells = layerCells(CAVE, input.atlas, 0).flat().filter((c) => c !== null);
    expect(bytes.length).toBe(2 + cells.length * 12);
    const u16 = (i: number) => bytes[i] | (bytes[i + 1] << 8);
    const first = cellCoords(input.atlas, layerCells(CAVE, input.atlas, 0)[0][0]!);
    expect([u16(2), u16(4), u16(6), u16(8), u16(10), u16(12)]).toEqual([0, 0, 0, first.x, first.y, 0]);
    const collisionBytes = nodes[3].props.tile_map_data.match(/\((.*)\)/)![1].split(", ");
    expect(collisionBytes.length).toBe(2 + 8 * 12);
  });

  it("leaves out the collision layer when there is no collision", () => {
    const scene = textOf(fileMap(godotTilemapFiles(tilemapExport(PLAIN))), "plain/plain.tscn");
    expect(scene).not.toContain('name="Collision"');
  });
});

describe("Godot helpers", () => {
  it("formats floats like Godot", () => {
    expect([1, 0.125, 1000 / 150, 8].map(gdFloat)).toEqual(["1.0", "0.125", "6.66667", "8.0"]);
  });
  it("makes node names Godot accepts", () => {
    expect([nodeName("Mossbrook Meadow", "X"), nodeName("a.b:c@d/e", "X"), nodeName("!!", "X")]).toEqual(["MossbrookMeadow", "ABCDE", "X"]);
  });
});

/** `GODOT_EXPORT_DIR=/some/godot/project npm test -- godot` writes the exports there for a headless import check. */
it.runIf(process.env.GODOT_EXPORT_DIR)("writes the exports for a Godot import check", () => {
  const files = [PIP, COIN].flatMap(godotSpriteFiles).concat([MEADOW, CAVE, PLAIN].flatMap((t) => godotTilemapFiles(tilemapExport(t))));
  for (const file of files) {
    const path = join(process.env.GODOT_EXPORT_DIR!, "exports", file.path);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, file.data);
  }
});
