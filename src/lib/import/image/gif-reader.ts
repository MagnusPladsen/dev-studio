import { ImportError } from "../types";
import { MAX_ANIMATION_PIXELS, MAX_IMAGE_PIXELS } from "./limits";
import { createPixelImage, type PixelImage } from "./pixel-image";

/**
 * A small GIF87a/89a reader: every frame composited onto the full canvas (transparency and disposal applied),
 * with its delay. The counterpart of the encoder in `src/lib/gif.ts`.
 */

export interface GifAnimation {
  width: number;
  height: number;
  frames: { image: PixelImage; delay: number }[];
}

/** Browsers show 0 and 1 centisecond delays as 100 ms; so do we. */
const DEFAULT_DELAY_MS = 100;
const MAX_CODES = 4096;
const DAMAGED = "This GIF is damaged and can't be read.";

interface FrameControl {
  delay: number;
  disposal: number;
  transparentIndex: number | null;
}

class Reader {
  position = 0;
  constructor(readonly bytes: Uint8Array) {}
  byte(): number {
    if (this.position >= this.bytes.length) throw new ImportError(DAMAGED);
    return this.bytes[this.position++];
  }
  word(): number {
    return this.byte() | (this.byte() << 8);
  }
  take(length: number): Uint8Array {
    if (this.position + length > this.bytes.length) throw new ImportError(DAMAGED);
    const slice = this.bytes.subarray(this.position, this.position + length);
    this.position += length;
    return slice;
  }
  colorTable(packed: number): Uint8Array {
    return this.take(3 * (1 << ((packed & 7) + 1)));
  }
  /** Data sub-blocks, joined. */
  subBlocks(): Uint8Array {
    const parts: Uint8Array[] = [];
    let total = 0;
    for (let size = this.byte(); size > 0; size = this.byte()) {
      parts.push(this.take(size));
      total += size;
    }
    const joined = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) {
      joined.set(part, offset);
      offset += part.length;
    }
    return joined;
  }
}

/** Decodes GIF LZW data into `pixelCount` colour indices. Stops quietly at the end of the data. */
export function decodeLzw(data: Uint8Array, minCodeSize: number, pixelCount: number): Uint8Array {
  const out = new Uint8Array(pixelCount);
  const clear = 1 << minCodeSize;
  const end = clear + 1;
  const prefix = new Int16Array(MAX_CODES);
  const suffix = new Uint8Array(MAX_CODES);
  const first = new Uint8Array(MAX_CODES);
  const length = new Uint16Array(MAX_CODES);
  for (let code = 0; code < clear; code++) {
    suffix[code] = first[code] = code;
    length[code] = 1;
  }
  let codeSize = minCodeSize + 1;
  let next = end + 1;
  let previous = -1;
  let position = 0;
  let bits = 0;
  let bitCount = 0;
  let index = 0;

  const write = (code: number) => {
    const size = length[code];
    for (let at = position + size - 1, c = code; at >= position; at--, c = prefix[c]) if (at < pixelCount) out[at] = suffix[c];
    position += size;
  };

  while (position < pixelCount) {
    while (bitCount < codeSize && index < data.length) {
      bits |= data[index++] << bitCount;
      bitCount += 8;
    }
    if (bitCount < codeSize) break;
    const code = bits & ((1 << codeSize) - 1);
    bits >>>= codeSize;
    bitCount -= codeSize;

    if (code === clear) {
      codeSize = minCodeSize + 1;
      next = end + 1;
      previous = -1;
      continue;
    }
    if (code === end) break;
    if (previous === -1) {
      if (code >= clear) break;
      write(code);
      previous = code;
      continue;
    }
    if (code > next || (code === next && next >= MAX_CODES)) break;
    const firstOfCode = code === next ? first[previous] : first[code];
    if (next < MAX_CODES) {
      prefix[next] = previous;
      suffix[next] = firstOfCode;
      first[next] = first[previous];
      length[next] = length[previous] + 1;
      next++;
      if (next === 1 << codeSize && codeSize < 12) codeSize++;
    }
    write(code);
    previous = code;
  }
  return out;
}

/** Interlaced GIFs store rows in four passes; this maps the stored row order to the real rows. */
function interlacedRows(height: number): number[] {
  const rows: number[] = [];
  for (const [start, step] of [[0, 8], [4, 8], [2, 4], [1, 2]]) for (let y = start; y < height; y += step) rows.push(y);
  return rows;
}

interface ImageBlock {
  left: number;
  top: number;
  width: number;
  height: number;
  indices: Uint8Array;
  palette: Uint8Array;
  isInterlaced: boolean;
}

function readImageBlock(reader: Reader, globalPalette: Uint8Array | null): ImageBlock {
  const left = reader.word();
  const top = reader.word();
  const width = reader.word();
  const height = reader.word();
  const packed = reader.byte();
  const palette = packed & 0x80 ? reader.colorTable(packed) : globalPalette;
  if (!palette) throw new ImportError(DAMAGED);
  const minCodeSize = reader.byte();
  if (minCodeSize < 1 || minCodeSize > 11) throw new ImportError(DAMAGED);
  const indices = decodeLzw(reader.subBlocks(), minCodeSize, width * height);
  return { left, top, width, height, indices, palette, isInterlaced: Boolean(packed & 0x40) };
}

function drawBlock(canvas: PixelImage, block: ImageBlock, transparentIndex: number | null): void {
  const rows = block.isInterlaced ? interlacedRows(block.height) : null;
  for (let row = 0; row < block.height; row++) {
    const y = block.top + (rows ? rows[row] : row);
    if (y >= canvas.height) continue;
    for (let column = 0; column < block.width; column++) {
      const x = block.left + column;
      const colorIndex = block.indices[row * block.width + column];
      if (x >= canvas.width || colorIndex === transparentIndex || colorIndex * 3 + 2 >= block.palette.length) continue;
      const at = (y * canvas.width + x) * 4;
      canvas.data[at] = block.palette[colorIndex * 3];
      canvas.data[at + 1] = block.palette[colorIndex * 3 + 1];
      canvas.data[at + 2] = block.palette[colorIndex * 3 + 2];
      canvas.data[at + 3] = 255;
    }
  }
}

function clearArea(canvas: PixelImage, block: ImageBlock): void {
  for (let y = block.top; y < Math.min(canvas.height, block.top + block.height); y++) {
    const from = (y * canvas.width + block.left) * 4;
    const to = (y * canvas.width + Math.min(canvas.width, block.left + block.width)) * 4;
    if (to > from) canvas.data.fill(0, from, to);
  }
}

function readControl(reader: Reader): FrameControl {
  const data = reader.subBlocks();
  if (data.length < 4) return { delay: DEFAULT_DELAY_MS, disposal: 0, transparentIndex: null };
  const centiseconds = data[1] | (data[2] << 8);
  return {
    delay: centiseconds <= 1 ? DEFAULT_DELAY_MS : centiseconds * 10,
    disposal: (data[0] >> 2) & 7,
    transparentIndex: data[0] & 1 ? data[3] : null,
  };
}

function readHeader(reader: Reader): { width: number; height: number; globalPalette: Uint8Array | null } {
  const signature = String.fromCharCode(...reader.take(6));
  if (signature !== "GIF87a" && signature !== "GIF89a") throw new ImportError("This isn't a GIF file.");
  const width = reader.word();
  const height = reader.word();
  const packed = reader.byte();
  reader.take(2);
  if (!width || !height) throw new ImportError(DAMAGED);
  if (width * height > MAX_IMAGE_PIXELS) throw new ImportError(`This GIF is ${width}×${height} pixels. GIFs up to 4096×4096 can be imported.`);
  return { width, height, globalPalette: packed & 0x80 ? reader.colorTable(packed) : null };
}

export function readGif(bytes: Uint8Array): GifAnimation {
  const reader = new Reader(bytes);
  const { width, height, globalPalette } = readHeader(reader);
  const frames: GifAnimation["frames"] = [];
  const canvas = createPixelImage(width, height);
  let control: FrameControl | null = null;
  let cleanup: (() => void) | null = null;
  try {
    for (let introducer = reader.byte(); introducer !== 0x3b; introducer = reader.byte()) {
      if (introducer === 0x21) {
        const label = reader.byte();
        if (label === 0xf9) control = readControl(reader);
        else reader.subBlocks();
        continue;
      }
      if (introducer !== 0x2c) throw new ImportError(DAMAGED);
      if ((frames.length + 1) * width * height > MAX_ANIMATION_PIXELS) {
        throw new ImportError(`This GIF has too many frames to import (more than ${frames.length}). Try a shorter or smaller one.`);
      }
      const block = readImageBlock(reader, globalPalette);
      cleanup?.();
      const { delay, disposal, transparentIndex }: FrameControl = control ?? { delay: DEFAULT_DELAY_MS, disposal: 0, transparentIndex: null };
      const before = disposal === 3 ? new Uint8ClampedArray(canvas.data) : null;
      drawBlock(canvas, block, transparentIndex);
      frames.push({ image: { width, height, data: new Uint8ClampedArray(canvas.data) }, delay });
      cleanup = disposal === 2 ? () => clearArea(canvas, block) : before ? () => canvas.data.set(before) : null;
      control = null;
    }
  } catch (error) {
    // A file cut off after some whole frames still has those frames.
    if (!(error instanceof ImportError) || error.message !== DAMAGED || frames.length === 0) throw error;
  }
  if (!frames.length) throw new ImportError("This GIF has no pictures in it.");
  return { width, height, frames };
}
