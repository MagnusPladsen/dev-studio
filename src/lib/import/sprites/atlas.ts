import type { Importer } from "../types";
import { ImportError } from "../types";
import { browserImageCodec, type ImageCodec } from "../image/codec";
import { assertFileSize, MAX_TEXT_BYTES } from "../image/limits";
import { cropImage, downscaleBy, type PixelImage } from "../image/pixel-image";
import { nameFromFile } from "../pixel-art/sprite-from-images";
import { assertFrameSize, buildSheetImport, MAX_SHEET_FRAMES, skippedWarning, type FrameGroup, type SheetImport } from "./sheet-import";

export interface AtlasFrame {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Atlas {
  frames: AtlasFrame[];
  /** The image file the atlas was written for, e.g. "heroes.png". */
  image?: string;
  /** Sprite Sheets exports bigger copies (2×, 3×, 4×) and says so here. */
  scale: number;
}

const NOT_AN_ATLAS = "This isn't an atlas file. Export one from a sprite sheet with Export → Atlas JSON.";
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** `{x, y, w, h}` as Sprite Sheets writes it, or `{frame: {x, y, w, h}}` as TexturePacker writes it. */
function readRect(key: string, value: unknown): AtlasFrame | null {
  const rect = isRecord(value) && isRecord(value.frame) ? value.frame : value;
  if (!isRecord(rect)) return null;
  const [x, y, w, h] = [rect.x, rect.y, rect.w, rect.h];
  if (![x, y, w, h].every((n) => typeof n === "number" && Number.isFinite(n) && n >= 0)) return null;
  if (!(w as number) || !(h as number)) return null;
  return { key, x: x as number, y: y as number, w: w as number, h: h as number };
}

export function readAtlas(data: unknown): Atlas {
  if (!isRecord(data)) throw new ImportError(NOT_AN_ATLAS);
  const entries: [string, unknown][] = Array.isArray(data.frames)
    ? data.frames.map((frame, i) => [isRecord(frame) && typeof frame.filename === "string" ? frame.filename : `frame_${i}`, frame])
    : isRecord(data.frames)
      ? Object.entries(data.frames)
      : [];
  const frames = entries.map(([key, value]) => readRect(key, value));
  if (!frames.length || frames.some((frame) => !frame)) throw new ImportError(NOT_AN_ATLAS);
  const meta = isRecord(data.meta) ? data.meta : {};
  const scale = Math.max(1, Math.round(Number(meta.scale) || 1));
  return { frames: frames as AtlasFrame[], image: typeof meta.image === "string" ? meta.image : undefined, scale };
}

/** "hero_0", "hero_1" → sprite "hero"; frames of one sprite must also share a size. */
export function groupFrames(frames: AtlasFrame[]): { name: string; frames: AtlasFrame[] }[] {
  const groups = new Map<string, { name: string; frames: { index: number; frame: AtlasFrame }[] }>();
  frames.forEach((frame, order) => {
    const match = /^(.*?)[_-]?(\d+)(\.\w+)?$/.exec(frame.key);
    const name = (match?.[1] || frame.key.replace(/\.\w+$/, "")).replace(/_/g, " ").trim() || "sprite";
    const groupKey = `${name}\n${frame.w}x${frame.h}`;
    const group = groups.get(groupKey) ?? { name, frames: [] };
    group.frames.push({ index: match ? Number(match[2]) : order, frame });
    groups.set(groupKey, group);
  });
  return [...groups.values()].map(({ name, frames: entries }) => ({ name, frames: entries.sort((a, b) => a.index - b.index).map((entry) => entry.frame) }));
}

/**
 * The atlas JSON that Sprite Sheets exports (TexturePacker's hash and array formats work too), together with its PNG.
 * The importer in the menu has no image yet: the page asks for the PNG, then builds one with `image` set.
 */
export function atlasImporter(image: PixelImage | null = null, codec: ImageCodec = browserImageCodec): Importer<SheetImport> {
  return {
    id: "sheet-atlas",
    label: "Atlas JSON + PNG",
    description: "A sheet exported from here, back as sprites",
    accept: [".json", "application/json"],
    detect(_file, text) {
      try {
        return readAtlas(JSON.parse(text)).frames.length > 0;
      } catch {
        return false;
      }
    },
    async parse(file) {
      assertFileSize(file, MAX_TEXT_BYTES);
      const atlas = readAtlas(JSON.parse(await file.text()));
      if (!image) throw new ImportError(`Pick the atlas's image too${atlas.image ? ` ("${atlas.image}")` : ""}.`);
      if (atlas.frames.length > MAX_SHEET_FRAMES) throw new ImportError(`This atlas has ${atlas.frames.length} frames. Up to ${MAX_SHEET_FRAMES} can be imported.`);
      const outside = atlas.frames.filter((f) => f.x + f.w > image.width || f.y + f.h > image.height).length;
      const groups: FrameGroup[] = groupFrames(atlas.frames).map(({ name, frames }) => {
        assertFrameSize(Math.round(frames[0].w / atlas.scale), Math.round(frames[0].h / atlas.scale));
        return { name, frames: frames.map((f) => downscaleBy(cropImage(image, f.x, f.y, f.w, f.h), atlas.scale)) };
      });
      const padding = Math.max(0, Math.min(16, Math.round(Math.min(...atlas.frames.map((f) => f.x)) / atlas.scale)));
      const { item, skipped } = buildSheetImport(nameFromFile(file.name, "Imported sheet"), groups, padding, codec);
      const warnings = skippedWarning(skipped);
      if (outside) warnings.push(`${outside} ${outside === 1 ? "frame reaches" : "frames reach"} past the edge of the image`);
      if (atlas.scale > 1) warnings.push(`This atlas was exported at ${atlas.scale}×; frames were shrunk back to 1×`);
      return { items: [item], warnings };
    },
  };
}
