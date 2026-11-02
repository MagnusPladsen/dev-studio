import { addColor, hexToRgb } from "./colors";
import { createGrid, GRID_SIZES, MAX_GRID_SIZE, voxelIndex, type VoxelGrid } from "./grid";

export interface PixelImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export type SpriteShape = "flat" | "puffy";
export type SpriteBack = "mirror" | "darker";

export interface SpriteDepthOptions {
  /** How many cubes thick the model is at its thickest, 1–8. */
  depth?: number;
  /** "flat" extrudes straight back; "puffy" is thinner near the outline, like an inflated balloon. */
  shape?: SpriteShape;
  /** "darker" shades the back half so the model reads as 3D from the side. */
  back?: SpriteBack;
}

export type SpriteImport =
  | { ok: true; grid: VoxelGrid; colors: string[] }
  | { ok: false; reason: "too-large" | "empty" };

export const MIN_DEPTH = 1;
export const MAX_DEPTH = 8;
const OPAQUE_ALPHA = 128;
const BACK_SHADE = 0.72;

function toHex(red: number, green: number, blue: number): string {
  return `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function darken(hex: string): string {
  const [red, green, blue] = hexToRgb(hex);
  return toHex(Math.round(red * BACK_SHADE), Math.round(green * BACK_SHADE), Math.round(blue * BACK_SHADE));
}

export function clampDepth(depth: number): number {
  return Math.max(MIN_DEPTH, Math.min(MAX_DEPTH, Math.round(depth) || MIN_DEPTH));
}

function opaqueMask({ width, height, data }: PixelImage): Uint8Array {
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < mask.length; i++) mask[i] = data[i * 4 + 3] >= OPAQUE_ALPHA ? 1 : 0;
  return mask;
}

/**
 * Distance from each opaque pixel to the nearest transparent pixel or the image edge, rounded down,
 * so outline pixels are 1. Transparent pixels are 0.
 */
export function edgeDistances(image: PixelImage): Uint8Array {
  const { width, height } = image;
  const mask = opaqueMask(image);
  const holes: number[] = [];
  for (let i = 0; i < mask.length; i++) if (!mask[i]) holes.push(i);
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!mask[y * width + x]) continue;
      // the area outside the image counts as empty
      let best = Math.min(x + 1, y + 1, width - x, height - y);
      let bestSq = best * best;
      for (const hole of holes) {
        const dx = (hole % width) - x;
        const dy = Math.floor(hole / width) - y;
        const sq = dx * dx + dy * dy;
        if (sq < bestSq) bestSq = sq;
      }
      best = Math.sqrt(bestSq);
      out[y * width + x] = Math.max(1, Math.min(255, Math.floor(best)));
    }
  }
  return out;
}

/**
 * Which cube layers (front-to-back, as offsets from the model's middle) a pixel fills.
 * Flat: the full depth everywhere. Puffy: 2 × min(distance to edge, depth / 2) cubes, centred,
 * so the front and back bulge equally.
 */
export function thicknessAt(distance: number, depth: number, shape: SpriteShape): number {
  const d = clampDepth(depth);
  if (shape === "flat" || d === 1) return d;
  return 2 * Math.min(Math.floor(d / 2), Math.max(1, distance));
}

/** Nearest-neighbour shrink so neither side is bigger than `max`. Returns the same image if it fits. */
export function shrinkToFit(image: PixelImage, max = MAX_GRID_SIZE): PixelImage {
  const { width, height, data } = image;
  if (width <= max && height <= max) return image;
  const ratio = max / Math.max(width, height);
  const w = Math.max(1, Math.round(width * ratio));
  const h = Math.max(1, Math.round(height * ratio));
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(height - 1, Math.floor(((y + 0.5) * height) / h));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(width - 1, Math.floor(((x + 0.5) * width) / w));
      out.set(data.subarray((sy * width + sx) * 4, (sy * width + sx) * 4 + 4), (y * w + x) * 4);
    }
  }
  return { width: w, height: h, data: out };
}

export function spriteToVoxels(image: PixelImage, colors: string[], options: SpriteDepthOptions = {}): SpriteImport {
  const { width, height, data } = image;
  if (width > MAX_GRID_SIZE || height > MAX_GRID_SIZE) return { ok: false, reason: "too-large" };
  const depth = clampDepth(options.depth ?? 1);
  const shape = options.shape ?? "flat";
  const back = options.back ?? "mirror";

  const side = GRID_SIZES.find((candidate) => candidate >= Math.max(width, height, depth)) ?? MAX_GRID_SIZE;
  const grid = createGrid([side, side, side]);
  const offsetX = Math.floor((side - width) / 2);
  const middle = Math.floor(side / 2);
  const distances = shape === "puffy" && depth > 1 ? edgeDistances(image) : null;
  let palette = colors;
  let hasVoxels = false;

  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      const offset = (row * width + column) * 4;
      if (data[offset + 3] < OPAQUE_ALPHA) continue;
      const hex = toHex(data[offset], data[offset + 1], data[offset + 2]);
      const front = addColor(palette, hex);
      palette = front.colors;
      let backValue = front.value;
      if (back === "darker" && depth > 1) {
        const darker = addColor(palette, darken(hex));
        palette = darker.colors;
        backValue = darker.value;
      }
      const thickness = thicknessAt(distances ? distances[row * width + column] : depth, depth, shape);
      const start = middle - Math.floor(thickness / 2);
      for (let layer = 0; layer < thickness; layer++) {
        const z = start + layer;
        // the front faces +z, so the lower layers are the back; an odd middle layer counts as front
        const isBack = layer < Math.floor(thickness / 2);
        grid.data[voxelIndex(grid.size, offsetX + column, height - 1 - row, z)] = isBack ? backValue : front.value;
      }
      hasVoxels = true;
    }
  }

  return hasVoxels ? { ok: true, grid, colors: palette } : { ok: false, reason: "empty" };
}
