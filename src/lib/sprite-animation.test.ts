import { describe, expect, it } from "vitest";
import type { FrameTag, SpriteFrame } from "@/types";
import {
  asepriteSheetJson,
  clampDuration,
  frameDurations,
  frameTagsFor,
  playbackOrder,
  sheetLayout,
  tagLanes,
  tagsAfterDelete,
  tagsAfterInsert,
  TAG_COLORS,
  unusedTagColor,
} from "./sprite-animation";

const frames = (...durations: number[]): SpriteFrame[] => durations.map((duration, i) => ({ id: `f${i}`, pixels: "", duration }));
const tag = (from: number, to: number, direction: FrameTag["direction"] = "forward", name = "walk"): FrameTag => ({ id: name, name, from, to, color: "#6abe30", direction });

describe("frame durations", () => {
  it("keeps each frame's own duration once a sprite has them", () => {
    expect(frameDurations({ fps: 8, frames: frames(100, 100, 400), hasFrameDurations: true })).toEqual([100, 100, 400]);
    expect(frameDurations({ fps: 8, frames: frames(200, 200), hasFrameDurations: true })).toEqual([200, 200]);
  });

  it("plays older sprites at their fps, as the editor did before", () => {
    expect(frameDurations({ fps: 8, frames: frames(100, 100, 100) })).toEqual([125, 125, 125]);
    expect(frameDurations({ fps: 3, frames: frames(333, 333) })).toEqual([333, 333]);
  });

  it("keeps the delays of an older imported GIF, whose frames differ", () => {
    expect(frameDurations({ fps: 10, frames: frames(100, 500, 100) })).toEqual([100, 500, 100]);
  });

  it("falls back to fps when stored durations are missing or broken", () => {
    const broken = [{ id: "a", pixels: "" }, { id: "b", pixels: "", duration: Number.NaN }] as unknown as SpriteFrame[];
    expect(frameDurations({ fps: 10, frames: broken, hasFrameDurations: true })).toEqual([100, 100]);
  });

  it("clamps durations to whole milliseconds in range", () => {
    expect(clampDuration(0)).toBe(10);
    expect(clampDuration(99.6)).toBe(100);
    expect(clampDuration(1e9)).toBe(60000);
  });
});

describe("frame tags", () => {
  it("reads missing tags as none and fixes tags that no longer fit", () => {
    expect(frameTagsFor(undefined, 4)).toEqual([]);
    expect(frameTagsFor([tag(2, 9)], 4)).toEqual([tag(2, 3)]);
    expect(frameTagsFor([{ ...tag(3, 1), direction: "sideways" as FrameTag["direction"] }], 4)).toEqual([tag(3, 3)]);
  });

  it("plays a forward tag from its first frame to its last", () => {
    expect(playbackOrder(6, tag(1, 4))).toEqual([1, 2, 3, 4]);
  });

  it("plays a reverse tag from its last frame to its first", () => {
    expect(playbackOrder(6, tag(1, 4, "reverse"))).toEqual([4, 3, 2, 1]);
  });

  it("plays a ping-pong tag there and back without repeating its ends", () => {
    expect(playbackOrder(6, tag(1, 4, "pingpong"))).toEqual([1, 2, 3, 4, 3, 2]);
    expect(playbackOrder(6, tag(2, 3, "pingpong"))).toEqual([2, 3]);
    expect(playbackOrder(6, tag(5, 5, "pingpong"))).toEqual([5]);
  });

  it("plays every frame without a tag", () => {
    expect(playbackOrder(3)).toEqual([0, 1, 2]);
  });

  it("moves and grows tags when a frame is inserted", () => {
    const tags = [tag(0, 1, "forward", "idle"), tag(2, 4)];
    expect(tagsAfterInsert(tags, 1)).toEqual([tag(0, 2, "forward", "idle"), tag(3, 5)]);
    expect(tagsAfterInsert(tags, 5)).toEqual(tags);
    expect(tagsAfterInsert(tags, 5, true)).toEqual([tags[0], tag(2, 5)]);
  });

  it("moves and shrinks tags when a frame is deleted, dropping a tag left with none", () => {
    const tags = [tag(0, 0, "forward", "idle"), tag(1, 3)];
    expect(tagsAfterDelete(tags, 0)).toEqual([tag(0, 2)]);
    expect(tagsAfterDelete(tags, 2)).toEqual([tags[0], tag(1, 2)]);
  });

  it("gives a new tag a colour no other tag uses", () => {
    expect(unusedTagColor([{ ...tag(0, 0), color: TAG_COLORS[0] }])).toBe(TAG_COLORS[1]);
  });

  it("stacks overlapping tags in separate rows", () => {
    expect(tagLanes([tag(0, 3), tag(2, 5), tag(4, 6), tag(6, 7)])).toEqual([0, 1, 0, 1]);
  });
});

describe("sprite sheet JSON", () => {
  it("lays frames out in the same near-square grid as the PNG", () => {
    expect(sheetLayout(5, 16, 8)).toMatchObject({ columns: 3, rows: 2 });
    expect(sheetLayout(5, 16, 8).rects[4]).toEqual({ x: 16, y: 8, w: 16, h: 8 });
  });

  it("writes Aseprite's array format with durations and frame tags", () => {
    const json = asepriteSheetJson({
      name: "Pip",
      image: "Pip_sheet.png",
      width: 16,
      height: 16,
      durations: [400, 150, 125, 125],
      tags: [tag(0, 1, "pingpong", "idle"), { ...tag(2, 3), color: "#abc" }],
      app: "https://gamedev-studio.pladsen.dev",
    });
    expect(json.frames.map((frame) => frame.duration)).toEqual([400, 150, 125, 125]);
    expect(json.frames[3]).toMatchObject({ filename: "Pip 3", frame: { x: 16, y: 16, w: 16, h: 16 }, sourceSize: { w: 16, h: 16 } });
    expect(json.meta).toMatchObject({ image: "Pip_sheet.png", size: { w: 32, h: 32 }, format: "RGBA8888" });
    expect(json.meta.frameTags).toEqual([
      { name: "idle", from: 0, to: 1, direction: "pingpong", color: "#6abe30ff" },
      { name: "walk", from: 2, to: 3, direction: "forward", color: "#aabbccff" },
    ]);
  });
});
