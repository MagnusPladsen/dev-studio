import { v4 as uuid } from "uuid";
import type { Sprite, SpriteSheet } from "@/types";
import { ImportError } from "../types";
import type { ImageCodec } from "../image/codec";
import { isBlank, type PixelImage } from "../image/pixel-image";
import { buildSprite, DEFAULT_FRAME_MS, MAX_SPRITE_SIZE } from "../pixel-art/sprite-from-images";

/** What a Sprite Sheets import makes: a new sheet plus the new sprites it packs. */
export interface SheetImport {
  sheet: SpriteSheet;
  sprites: Sprite[];
}

export const MAX_SHEET_FRAMES = 1024;

export interface FrameGroup {
  name: string;
  frames: PixelImage[];
}

export function assertFrameSize(width: number, height: number): void {
  if (width > MAX_SPRITE_SIZE || height > MAX_SPRITE_SIZE) {
    throw new ImportError(`Each frame is ${width}×${height}. Sprites go up to ${MAX_SPRITE_SIZE}×${MAX_SPRITE_SIZE}.`);
  }
}

/** One sprite per group (frames left to right), all packed into one new sheet. Empty frames are left out. */
export function buildSheetImport(sheetName: string, groups: FrameGroup[], padding: number, codec: ImageCodec): { item: SheetImport; skipped: number } {
  let skipped = 0;
  const sprites = groups.flatMap(({ name, frames }) => {
    const visible = frames.filter((frame) => !isBlank(frame));
    skipped += frames.length - visible.length;
    if (!visible.length) return [];
    const encoded = visible.map((frame) => ({ pixels: codec.encode(frame), duration: DEFAULT_FRAME_MS }));
    return [buildSprite(name, visible[0].width, visible[0].height, encoded)];
  });
  if (!sprites.length) throw new ImportError("Every frame in this image is empty.");
  const sheet: SpriteSheet = { id: uuid(), projectId: "", name: sheetName, spriteIds: sprites.map((sprite) => sprite.id), padding, powerOfTwo: false, createdAt: "" };
  return { item: { sheet, sprites }, skipped };
}

export function skippedWarning(skipped: number): string[] {
  return skipped ? [`Left out ${skipped} empty ${skipped === 1 ? "frame" : "frames"}`] : [];
}
