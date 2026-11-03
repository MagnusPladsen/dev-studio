import { ImportError } from "../types";
import { assertFileSize, assertPixelCount, MAX_IMAGE_BYTES } from "./limits";
import type { PixelImage } from "./pixel-image";

/**
 * Turns image files into pixels and pixels into PNG data URLs. The browser does this with a canvas; tests pass a fake,
 * so the importers that use it stay pure.
 */
export interface ImageCodec {
  decode(file: File): Promise<PixelImage>;
  encode(image: PixelImage): string;
}

function canvasOf(width: number, height: number): { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new ImportError("This browser can't read images here.");
  return { canvas, context };
}

async function decodeInBrowser(file: File): Promise<PixelImage> {
  assertFileSize(file, MAX_IMAGE_BYTES);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { premultiplyAlpha: "none", colorSpaceConversion: "none" });
  } catch {
    throw new ImportError(`"${file.name}" isn't an image this browser can open.`);
  }
  try {
    assertPixelCount(file.name, bitmap.width, bitmap.height);
    const { context } = canvasOf(bitmap.width, bitmap.height);
    context.drawImage(bitmap, 0, 0);
    const { width, height, data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
    return { width, height, data };
  } finally {
    bitmap.close();
  }
}

function encodeInBrowser(image: PixelImage): string {
  const { canvas, context } = canvasOf(image.width, image.height);
  context.putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0);
  return canvas.toDataURL("image/png");
}

export const browserImageCodec: ImageCodec = { decode: decodeInBrowser, encode: encodeInBrowser };

/** The size of an image file without reading its pixels; for import dialogs that ask before importing. */
export async function probeImageSize(file: File): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return size;
}
