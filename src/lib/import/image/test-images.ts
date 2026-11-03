import type { ImageCodec } from "./codec";
import type { PixelImage } from "./pixel-image";

/** For tests: an image filled from a function returning [r, g, b, a] per pixel. */
export function makeImage(width: number, height: number, pixel: (x: number, y: number) => [number, number, number, number]): PixelImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set(pixel(x, y), (y * width + x) * 4);
  return { width, height, data };
}

export function pixelAt(image: PixelImage, x: number, y: number): number[] {
  const at = (y * image.width + x) * 4;
  return [...image.data.subarray(at, at + 4)];
}

export function binaryFile(bytes: Uint8Array | number[], name: string, type = "application/octet-stream"): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

/**
 * For tests: a codec whose "files" are JSON `{ width, height, data: number[] }` and whose data URLs are that same
 * JSON, so tests can read back what an importer encoded.
 */
export const fakeCodec: ImageCodec = {
  async decode(file) {
    const { width, height, data } = JSON.parse(await file.text());
    return { width, height, data: new Uint8ClampedArray(data) };
  },
  encode: (image) => `fake:${JSON.stringify({ width: image.width, height: image.height, data: [...image.data] })}`,
};

export function imageFile(image: PixelImage, name = "image.png", type = "image/png"): File {
  return new File([JSON.stringify({ width: image.width, height: image.height, data: [...image.data] })], name, { type });
}

export function decodeFake(url: string): PixelImage {
  const { width, height, data } = JSON.parse(url.slice("fake:".length));
  return { width, height, data: new Uint8ClampedArray(data) };
}
