import type { PixelImage } from "@/lib/voxels/sprite";

export type { PixelImage };

const OPAQUE_ALPHA = 128;

export function createPixelImage(width: number, height: number): PixelImage {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

/** The `width`×`height` area at (`left`, `top`); anything outside the source stays transparent. */
export function cropImage(image: PixelImage, left: number, top: number, width: number, height: number): PixelImage {
  const out = createPixelImage(width, height);
  for (let y = 0; y < height; y++) {
    const sourceY = top + y;
    if (sourceY < 0 || sourceY >= image.height) continue;
    const fromX = Math.max(0, -left);
    const toX = Math.min(width, image.width - left);
    if (toX <= fromX) continue;
    const start = (sourceY * image.width + left + fromX) * 4;
    out.data.set(image.data.subarray(start, start + (toX - fromX) * 4), (y * width + fromX) * 4);
  }
  return out;
}

/** Nearest-neighbour shrink so the image fits inside `maxWidth`×`maxHeight`. Returns the same image if it fits. */
export function fitWithin(image: PixelImage, maxWidth: number, maxHeight: number): PixelImage {
  const { width, height, data } = image;
  if (width <= maxWidth && height <= maxHeight) return image;
  const ratio = Math.min(maxWidth / width, maxHeight / height);
  const w = Math.max(1, Math.min(maxWidth, Math.round(width * ratio)));
  const h = Math.max(1, Math.min(maxHeight, Math.round(height * ratio)));
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const sourceY = Math.min(height - 1, Math.floor(((y + 0.5) * height) / h));
    for (let x = 0; x < w; x++) {
      const sourceX = Math.min(width - 1, Math.floor(((x + 0.5) * width) / w));
      const at = (sourceY * width + sourceX) * 4;
      out.set(data.subarray(at, at + 4), (y * w + x) * 4);
    }
  }
  return { width: w, height: h, data: out };
}

/** Takes every `factor`-th pixel: undoes a whole-number upscale. */
export function downscaleBy(image: PixelImage, factor: number): PixelImage {
  if (factor <= 1) return image;
  return fitWithin(image, Math.max(1, Math.round(image.width / factor)), Math.max(1, Math.round(image.height / factor)));
}

export function isBlank(image: PixelImage): boolean {
  for (let i = 3; i < image.data.length; i += 4) if (image.data[i] !== 0) return false;
  return true;
}

function parseHex(hex: string): [number, number, number] {
  const value = parseInt(hex.replace("#", "").slice(0, 6), 16) || 0;
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** Every visible pixel becomes the nearest palette colour (fully opaque); faint pixels become transparent. */
export function snapToPalette(image: PixelImage, palette: string[]): PixelImage {
  const colors = palette.map(parseHex);
  if (!colors.length) return image;
  const data = new Uint8ClampedArray(image.data.length);
  const cache = new Map<number, [number, number, number]>();
  for (let i = 0; i < data.length; i += 4) {
    if (image.data[i + 3] < OPAQUE_ALPHA) continue;
    const key = (image.data[i] << 16) | (image.data[i + 1] << 8) | image.data[i + 2];
    let nearest = cache.get(key);
    if (!nearest) {
      nearest = colors.reduce((best, color) => (distance(color, image.data, i) < distance(best, image.data, i) ? color : best));
      cache.set(key, nearest);
    }
    data.set([...nearest, 255], i);
  }
  return { width: image.width, height: image.height, data };
}

function distance([r, g, b]: [number, number, number], data: Uint8ClampedArray, i: number): number {
  return (r - data[i]) ** 2 + (g - data[i + 1]) ** 2 + (b - data[i + 2]) ** 2;
}
