import { describe, expect, it } from "vitest";
import { encodeGif } from "@/lib/gif";
import { ImportError } from "../types";
import { readGif } from "./gif-reader";
import { makeImage, pixelAt } from "./test-images";

async function encoded(frames: { image: ReturnType<typeof makeImage>; delay: number }[], scale = 1): Promise<Uint8Array> {
  const blob = encodeGif(frames.map((frame) => ({ ...frame, image: frame.image as unknown as ImageData })), { scale });
  return new Uint8Array(await blob.arrayBuffer());
}

/** Codes written 3 bits each, LSB first: the way GIF packs LZW data with a minimum code size of 2. */
function packCodes(codes: number[]): number[] {
  const bytes: number[] = [];
  let bits = 0;
  let count = 0;
  for (const code of codes) {
    bits |= code << count;
    count += 3;
    while (count >= 8) {
      bytes.push(bits & 255);
      bits >>= 8;
      count -= 8;
    }
  }
  if (count) bytes.push(bits & 255);
  return bytes;
}

/** "Uncompressed" LZW: a clear code before every two pixels keeps every code 3 bits wide. */
function rawLzw(indices: number[]): number[] {
  const codes: number[] = [];
  indices.forEach((index, i) => {
    if (i % 2 === 0) codes.push(4);
    codes.push(index);
  });
  codes.push(5);
  const data = packCodes(codes);
  return [2, data.length, ...data, 0];
}

const PALETTE = [0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255];

/** A hand-built GIF89a with a 4-colour global palette (black, red, green, blue). */
function handMadeGif(width: number, height: number, frames: { indices: number[]; disposal?: number; transparent?: number; delay?: number; interlaced?: boolean; rect?: [number, number, number, number] }[]): Uint8Array {
  const bytes = [..."GIF89a"].map((c) => c.charCodeAt(0));
  bytes.push(width, 0, height, 0, 0x81, 0, 0, ...PALETTE);
  for (const frame of frames) {
    const [left, top, w, h] = frame.rect ?? [0, 0, width, height];
    const transparent = frame.transparent ?? null;
    bytes.push(0x21, 0xf9, 4, ((frame.disposal ?? 0) << 2) | (transparent === null ? 0 : 1), frame.delay ?? 10, 0, transparent ?? 0, 0);
    bytes.push(0x2c, left, 0, top, 0, w, 0, h, 0, frame.interlaced ? 0x40 : 0, ...rawLzw(frame.indices));
  }
  bytes.push(0x3b);
  return new Uint8Array(bytes);
}

describe("readGif", () => {
  it("reads back what the app's own GIF encoder writes, with delays", async () => {
    const red = makeImage(5, 3, (x) => (x < 2 ? [255, 0, 0, 255] : [0, 0, 0, 0]));
    const blue = makeImage(5, 3, (x, y) => (y === 1 && x > 0 ? [10, 20, 200, 255] : [0, 0, 0, 0]));
    const gif = readGif(await encoded([{ image: red, delay: 120 }, { image: blue, delay: 50 }]));
    expect(gif.width).toBe(5);
    expect(gif.frames.map((frame) => frame.delay)).toEqual([120, 50]);
    expect(pixelAt(gif.frames[0].image, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(pixelAt(gif.frames[0].image, 4, 2)[3]).toBe(0);
    // The encoder disposes to background, so frame 2 doesn't keep frame 1's red.
    expect(pixelAt(gif.frames[1].image, 0, 0)[3]).toBe(0);
    expect(pixelAt(gif.frames[1].image, 3, 1)).toEqual([10, 20, 200, 255]);
  });

  it("decodes long runs that grow the LZW code size", async () => {
    const noise = makeImage(64, 64, (x, y) => [(x * 7 + y * 13) % 200, 40, (x + y) % 2 ? 90 : 10, 255]);
    const gif = readGif(await encoded([{ image: noise, delay: 100 }]));
    expect([...gif.frames[0].image.data]).toEqual([...noise.data]);
  });

  it("puts interlaced rows back in order", () => {
    const rows = [0, 1, 2, 3, 0, 1, 2, 3, 0, 1];
    // Stored order for 10 rows: 0, 8, 4, 2, 6, 1, 3, 5, 7, 9.
    const stored = [0, 8, 4, 2, 6, 1, 3, 5, 7, 9].map((y) => rows[y]);
    const gif = readGif(handMadeGif(1, 10, [{ indices: stored, interlaced: true }]));
    expect(rows.map((_, y) => pixelAt(gif.frames[0].image, 0, y)[0])).toEqual(rows.map((index) => PALETTE[index * 3]));
  });

  it("keeps the previous frame under transparent pixels and applies 'restore to background'", () => {
    const gif = readGif(
      handMadeGif(2, 1, [
        { indices: [1, 1], disposal: 1 },
        { indices: [3, 0], transparent: 0, disposal: 2 },
        { indices: [2], rect: [1, 0, 1, 1] },
      ])
    );
    expect(pixelAt(gif.frames[1].image, 0, 0)).toEqual([0, 0, 255, 255]);
    expect(pixelAt(gif.frames[1].image, 1, 0)).toEqual([255, 0, 0, 255]);
    // Frame 2 was cleared after showing, so frame 3 starts from transparent.
    expect(pixelAt(gif.frames[2].image, 0, 0)[3]).toBe(0);
    expect(pixelAt(gif.frames[2].image, 1, 0)).toEqual([0, 255, 0, 255]);
  });

  it("shows 0-delay frames for 100 ms, like browsers", () => {
    expect(readGif(handMadeGif(1, 1, [{ indices: [1], delay: 0 }])).frames[0].delay).toBe(100);
  });

  it("keeps the whole frames of a file that was cut off", () => {
    const whole = handMadeGif(1, 1, [{ indices: [1] }, { indices: [2] }]);
    const gif = readGif(whole.subarray(0, whole.length - 6));
    expect(gif.frames).toHaveLength(1);
  });

  it("refuses files that aren't GIFs, and huge ones", () => {
    expect(() => readGif(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]))).toThrow(ImportError);
    const huge = handMadeGif(1, 1, [{ indices: [1] }]);
    huge.set([0xff, 0xff, 0xff, 0xff], 6);
    expect(() => readGif(huge)).toThrow(/4096×4096/);
  });
});
