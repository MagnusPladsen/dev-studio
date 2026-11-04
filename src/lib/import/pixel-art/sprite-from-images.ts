import { v4 as uuid } from "uuid";
import type { Sprite } from "@/types";
import { ImportError } from "../types";
import { cropImage, fitWithin, snapToPalette, type PixelImage } from "../image/pixel-image";

/** Pixel Art's biggest canvas (matches the canvas size menu). */
export const MAX_SPRITE_SIZE = 256;
export const DEFAULT_FRAME_MS = 100;

export interface PixelImportOptions {
  /** Shrink pictures bigger than the target to fit. Without it a picture over 256 px is refused, and a layer is cropped. */
  shrink: boolean;
  /** Snap every colour to the nearest of these. */
  palette?: string[];
  /** Import into the open sprite as a new layer: the picture is placed on a canvas of this size. */
  canvas?: { width: number; height: number };
}

export const DEFAULT_PIXEL_IMPORT: PixelImportOptions = { shrink: false };

export interface PreparedFrames {
  frames: PixelImage[];
  warnings: string[];
}

function fitForNewSprite(image: PixelImage, fileName: string, shrink: boolean, warnings: string[]): PixelImage {
  if (image.width <= MAX_SPRITE_SIZE && image.height <= MAX_SPRITE_SIZE) return image;
  if (!shrink) {
    throw new ImportError(`"${fileName}" is ${image.width}×${image.height}. Sprites go up to ${MAX_SPRITE_SIZE}×${MAX_SPRITE_SIZE}; choose "Shrink to fit" to import it smaller.`);
  }
  const fitted = fitWithin(image, MAX_SPRITE_SIZE, MAX_SPRITE_SIZE);
  warnings.push(`Shrunk from ${image.width}×${image.height} to ${fitted.width}×${fitted.height}`);
  return fitted;
}

function fitOnCanvas(image: PixelImage, canvas: { width: number; height: number }, shrink: boolean, warnings: string[]): PixelImage {
  const isTooBig = image.width > canvas.width || image.height > canvas.height;
  const fitted = shrink ? fitWithin(image, canvas.width, canvas.height) : image;
  if (isTooBig) warnings.push(shrink ? `Shrunk to fit the ${canvas.width}×${canvas.height} canvas` : `Cropped to the ${canvas.width}×${canvas.height} canvas`);
  return cropImage(fitted, 0, 0, canvas.width, canvas.height);
}

/** Applies the import options to every frame: size limits, the layer's canvas and palette snapping. */
export function prepareFrames(images: PixelImage[], fileName: string, options: PixelImportOptions): PreparedFrames {
  const warnings: string[] = [];
  const { canvas, palette, shrink } = options;
  if (canvas && images.length > 1) warnings.push(`Only the first of ${images.length} frames went into the layer`);
  let frames = canvas
    ? [fitOnCanvas(images[0], canvas, shrink, warnings)]
    : images.map((frame, i) => fitForNewSprite(frame, fileName, shrink, i === 0 ? warnings : []));
  if (palette?.length) {
    frames = frames.map((frame) => snapToPalette(frame, palette));
    warnings.push(`Snapped colours to the palette's ${palette.length}`);
  }
  if (options.canvas) warnings.push("Added as a new layer");
  return { frames, warnings };
}

export function nameFromFile(fileName: string, fallback: string): string {
  const base = fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  return base || fallback;
}

/** The frame rate closest to the most common frame duration, within the editor's 1–30 fps. */
export function fpsForDurations(durations: number[]): number {
  const counts = new Map<number, number>();
  for (const duration of durations) counts.set(duration, (counts.get(duration) ?? 0) + 1);
  const common = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? DEFAULT_FRAME_MS;
  return Math.max(1, Math.min(30, Math.round(1000 / common)));
}

/** A new sprite (fresh ids) from encoded frames; `saveImportedAssets` fills in the project and timestamps. */
export function buildSprite(name: string, width: number, height: number, frames: { pixels: string; duration: number }[]): Sprite {
  return {
    id: uuid(),
    projectId: "",
    name,
    width,
    height,
    fps: fpsForDurations(frames.map((frame) => frame.duration)),
    hasFrameDurations: true,
    frames: frames.map(({ pixels, duration }) => ({
      id: uuid(),
      pixels,
      duration,
      layers: [{ id: uuid(), name: "Layer 1", visible: true, pixels }],
    })),
    tags: [],
    createdAt: "",
    updatedAt: "",
  };
}
