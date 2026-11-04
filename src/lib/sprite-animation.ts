import type { AnimationDirection, FrameTag, Sprite } from "@/types";

/** Frame timing and tags for Pixel Art: pure functions, shared by the editor, its exports and the examples. */

export const MIN_FRAME_MS = 10;
export const MAX_FRAME_MS = 60000;

export const ANIMATION_DIRECTIONS: { value: AnimationDirection; label: string }[] = [
  { value: "forward", label: "Forward" },
  { value: "reverse", label: "Reverse" },
  { value: "pingpong", label: "Ping-pong" },
];

/** Tag colours, picked in turn for new tags. Light enough to read dark text on, like Aseprite's. */
export const TAG_COLORS = ["#f6c945", "#6abe30", "#5aa9e6", "#d94a4a", "#9b5de5", "#f28c3b", "#3fc1b0", "#e573b5"];
/** Text on a tag band: dark on every tag colour. */
export const TAG_TEXT_COLOR = "#1d1a2b";

/** The first tag colour no tag uses yet, so a new band stands apart. */
export function unusedTagColor(tags: FrameTag[]): string {
  return TAG_COLORS.find((color) => !tags.some((tag) => tag.color === color)) ?? TAG_COLORS[tags.length % TAG_COLORS.length];
}

export function clampDuration(ms: number): number {
  if (!Number.isFinite(ms)) return MIN_FRAME_MS;
  return Math.max(MIN_FRAME_MS, Math.min(MAX_FRAME_MS, Math.round(ms)));
}

export function durationForFps(fps: number): number {
  return clampDuration(1000 / Math.max(1, fps));
}

/**
 * Each frame's duration as the editor plays it. Older sprites played every frame at `fps` and only GIF export read the
 * stored durations, so they keep `fps` timing, unless their frames differ (an imported GIF), which shows they were meant.
 */
export function frameDurations(sprite: Pick<Sprite, "fps" | "frames" | "hasFrameDurations">): number[] {
  const stored = sprite.frames.map((frame) => frame.duration);
  const isUsable = stored.every((ms) => typeof ms === "number" && Number.isFinite(ms) && ms > 0);
  const isMixed = isUsable && new Set(stored).size > 1;
  if (isUsable && (sprite.hasFrameDurations || isMixed)) return stored.map(clampDuration);
  return stored.map(() => durationForFps(sprite.fps));
}

/** Tags that still fit the frames: in range, from ≤ to, with a known direction. Missing tags (older sprites) are none. */
export function frameTagsFor(tags: FrameTag[] | undefined, frameCount: number): FrameTag[] {
  if (!Array.isArray(tags) || frameCount < 1) return [];
  return tags.flatMap((tag) => {
    const from = Math.max(0, Math.min(frameCount - 1, Math.round(tag.from)));
    const to = Math.max(from, Math.min(frameCount - 1, Math.round(tag.to)));
    if (!Number.isFinite(from) || !Number.isFinite(to)) return [];
    const direction = ANIMATION_DIRECTIONS.some((d) => d.value === tag.direction) ? tag.direction : "forward";
    return [{ ...tag, from, to, direction }];
  });
}

/** The frames one loop plays, in order. Ping-pong doesn't repeat its ends, so it loops smoothly (as in Aseprite). */
export function playbackOrder(frameCount: number, tag?: FrameTag | null): number[] {
  const from = tag ? tag.from : 0;
  const to = tag ? tag.to : frameCount - 1;
  const forward = Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i);
  if (!tag || tag.direction === "forward") return forward;
  if (tag.direction === "reverse") return forward.reverse();
  return [...forward, ...forward.slice(1, -1).reverse()];
}

/**
 * Tags after a frame is inserted at `at`. Tags after it move along and tags around it grow; `grow` also stretches a tag
 * that ends just before it (a duplicated last frame belongs to the tag, a new empty frame at the end doesn't).
 */
export function tagsAfterInsert(tags: FrameTag[], at: number, grow = false): FrameTag[] {
  return tags.map((tag) => {
    if (tag.from >= at) return { ...tag, from: tag.from + 1, to: tag.to + 1 };
    if (tag.to >= at || (grow && tag.to === at - 1)) return { ...tag, to: tag.to + 1 };
    return tag;
  });
}

/** Tags after the frame at `index` is deleted. A tag that loses its only frame goes too. */
export function tagsAfterDelete(tags: FrameTag[], index: number): FrameTag[] {
  return tags.flatMap((tag) => {
    if (tag.from > index) return [{ ...tag, from: tag.from - 1, to: tag.to - 1 }];
    if (tag.to < index) return [tag];
    if (tag.from === tag.to) return [];
    return [{ ...tag, to: tag.to - 1 }];
  });
}

/** Which row each tag's band sits in, so overlapping tags stack instead of covering each other. */
export function tagLanes(tags: FrameTag[]): number[] {
  const laneEnds: number[] = [];
  const lanes = new Array<number>(tags.length);
  const order = tags.map((tag, i) => ({ tag, i })).sort((a, b) => a.tag.from - b.tag.from || a.tag.to - b.tag.to);
  for (const { tag, i } of order) {
    let lane = laneEnds.findIndex((end) => end < tag.from);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = tag.to;
    lanes[i] = lane;
  }
  return lanes;
}

export interface SheetRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Frames in a near-square grid, left to right then down: the layout of the sprite sheet export. */
export function sheetLayout(frameCount: number, width: number, height: number): { columns: number; rows: number; rects: SheetRect[] } {
  const columns = Math.max(1, Math.ceil(Math.sqrt(frameCount)));
  const rows = Math.max(1, Math.ceil(frameCount / columns));
  const rects = Array.from({ length: frameCount }, (_, i) => ({ x: (i % columns) * width, y: Math.floor(i / columns) * height, w: width, h: height }));
  return { columns, rows, rects };
}

/** Aseprite writes colours as #rrggbbaa. */
function asepriteColor(hex: string): string {
  const digits = hex.replace("#", "").toLowerCase();
  const full = digits.length === 3 ? [...digits].map((c) => c + c).join("") : digits.slice(0, 6);
  return /^[0-9a-f]{6}$/.test(full) ? `#${full}ff` : "#000000ff";
}

export interface SheetJsonInput {
  name: string;
  image: string;
  width: number;
  height: number;
  durations: number[];
  tags: FrameTag[];
  app: string;
  /** Each frame's `filename`; Aseprite's default is "<name> <index>". Phaser's `createFromAseprite` wants the index alone. */
  frameName?: (index: number) => string;
}

/** The sprite sheet's data in Aseprite's JSON format (array), which engines and tools like Phaser and Godot plugins read. */
export function asepriteSheetJson({ name, image, width, height, durations, tags, app, frameName = (i) => `${name} ${i}` }: SheetJsonInput) {
  const { columns, rows, rects } = sheetLayout(durations.length, width, height);
  return {
    frames: rects.map((rect, i) => ({
      filename: frameName(i),
      frame: rect,
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: width, h: height },
      sourceSize: { w: width, h: height },
      duration: durations[i],
    })),
    meta: {
      app,
      version: "1.0",
      image,
      format: "RGBA8888",
      size: { w: columns * width, h: rows * height },
      scale: "1",
      frameTags: tags.map((tag) => ({ name: tag.name, from: tag.from, to: tag.to, direction: tag.direction, color: asepriteColor(tag.color) })),
      layers: [],
      slices: [],
    },
  };
}
