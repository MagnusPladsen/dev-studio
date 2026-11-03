import { ImportError } from "../types";

const MB = 1024 * 1024;

/** Biggest image file the art tools read; decoding more would stall the page. */
export const MAX_IMAGE_BYTES = 20 * MB;
/** Biggest picture (in pixels) the art tools decode: 4096×4096. */
export const MAX_IMAGE_PIXELS = 4096 * 4096;
/** Pixels across all frames of an animated GIF. */
export const MAX_ANIMATION_PIXELS = 32 * MB;
/** Biggest palette or atlas text file. */
export const MAX_TEXT_BYTES = 2 * MB;

function formatMegabytes(bytes: number): string {
  return `${Math.max(0.1, Math.round((bytes / MB) * 10) / 10)} MB`;
}

/** Refuses a file over `maxBytes` before any of it is read. */
export function assertFileSize(file: Pick<File, "name" | "size">, maxBytes: number): void {
  if (file.size <= maxBytes) return;
  throw new ImportError(`"${file.name}" is ${formatMegabytes(file.size)}. Files up to ${formatMegabytes(maxBytes)} can be imported.`);
}

export function assertPixelCount(fileName: string, width: number, height: number): void {
  if (width * height <= MAX_IMAGE_PIXELS) return;
  throw new ImportError(`"${fileName}" is ${width}×${height} pixels. Images up to 4096×4096 can be imported.`);
}
