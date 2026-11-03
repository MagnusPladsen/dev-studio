import { describe, expect, it } from "vitest";
import { encodeGif } from "@/lib/gif";
import { runImporter } from "@/lib/import";
import { binaryFile, decodeFake, fakeCodec, imageFile, makeImage, pixelAt } from "../image/test-images";
import { pixelGifImporter } from "./gif";
import { pixelImageImporter } from "./image";
import { fpsForDurations } from "./sprite-from-images";

const opaque = (r: number, g: number, b: number) => () => [r, g, b, 255] as [number, number, number, number];

async function gifFile(frames: { color: [number, number, number]; delay: number }[], size = 4): Promise<File> {
  const blob = encodeGif(frames.map(({ color, delay }) => ({ image: makeImage(size, size, opaque(...color)) as unknown as ImageData, delay })));
  return binaryFile(new Uint8Array(await blob.arrayBuffer()), "walk_cycle.gif", "image/gif");
}

describe("Pixel Art image import", () => {
  it("should make a one-frame sprite at the image's size", async () => {
    const outcome = await runImporter(pixelImageImporter({ shrink: false }, fakeCodec), imageFile(makeImage(12, 7, opaque(9, 8, 7)), "hero-idle.png"));
    if (!outcome.ok) throw new Error(outcome.message);
    const [sprite] = outcome.result.items;
    expect({ name: sprite.name, width: sprite.width, height: sprite.height, frames: sprite.frames.length }).toEqual({ name: "hero idle", width: 12, height: 7, frames: 1 });
    expect(sprite.frames[0].layers?.[0].pixels).toBe(sprite.frames[0].pixels);
  });

  it("should refuse a picture over 256 px unless shrinking was chosen", async () => {
    const outcome = await runImporter(pixelImageImporter({ shrink: false }, fakeCodec), imageFile(makeImage(300, 20, opaque(1, 1, 1))));
    expect(outcome).toMatchObject({ ok: false, message: expect.stringContaining("Shrink to fit") });
  });

  it("should shrink a big picture to fit 256 px when asked, and say so", async () => {
    const outcome = await runImporter(pixelImageImporter({ shrink: true }, fakeCodec), imageFile(makeImage(512, 128, opaque(1, 1, 1))));
    if (!outcome.ok) throw new Error(outcome.message);
    expect([outcome.result.items[0].width, outcome.result.items[0].height]).toEqual([256, 64]);
    expect(outcome.result.warnings).toEqual(["Shrunk from 512×128 to 256×64"]);
  });

  it("should snap colours to the palette only when one is given", async () => {
    const file = imageFile(makeImage(2, 1, (x) => (x ? [250, 10, 10, 255] : [0, 0, 0, 0])));
    const outcome = await runImporter(pixelImageImporter({ shrink: false, palette: ["#000000", "#ff0000"] }, fakeCodec), file);
    if (!outcome.ok) throw new Error(outcome.message);
    const image = decodeFake(outcome.result.items[0].frames[0].pixels);
    expect([pixelAt(image, 0, 0), pixelAt(image, 1, 0)]).toEqual([[0, 0, 0, 0], [255, 0, 0, 255]]);
  });

  it("should place a layer on the open sprite's canvas, cropping what doesn't fit", async () => {
    const options = { shrink: false, canvas: { width: 4, height: 4 } };
    const outcome = await runImporter(pixelImageImporter(options, fakeCodec), imageFile(makeImage(6, 2, opaque(5, 5, 5))));
    if (!outcome.ok) throw new Error(outcome.message);
    const layer = decodeFake(outcome.result.items[0].frames[0].pixels);
    expect([layer.width, layer.height, pixelAt(layer, 3, 1)[3], pixelAt(layer, 0, 3)[3]]).toEqual([4, 4, 255, 0]);
    expect(outcome.result.warnings).toEqual(["Cropped to the 4×4 canvas", "Added as a new layer"]);
  });

  it("should report a file the codec can't open in plain words", async () => {
    const broken = { ...fakeCodec, decode: () => Promise.reject(new Error("decode failed")) };
    const outcome = await runImporter(pixelImageImporter(undefined, broken), imageFile(makeImage(1, 1, opaque(0, 0, 0))));
    expect(outcome).toMatchObject({ ok: false, message: expect.stringContaining("Couldn't read") });
  });
});

describe("Pixel Art GIF import", () => {
  it("should turn every GIF frame into a sprite frame with its delay", async () => {
    const file = await gifFile([
      { color: [255, 0, 0], delay: 100 },
      { color: [0, 255, 0], delay: 100 },
      { color: [0, 0, 255], delay: 300 },
    ]);
    const outcome = await runImporter(pixelGifImporter(undefined, fakeCodec), file);
    if (!outcome.ok) throw new Error(outcome.message);
    const [sprite] = outcome.result.items;
    expect(sprite.frames.map((frame) => frame.duration)).toEqual([100, 100, 300]);
    expect(sprite.fps).toBe(10);
    expect(pixelAt(decodeFake(sprite.frames[2].pixels), 0, 0)).toEqual([0, 0, 255, 255]);
    expect(outcome.result.warnings[0]).toMatch(/preview plays at 10 fps/);
  });

  it("should not warn about delays when every frame has the same one", async () => {
    const outcome = await runImporter(pixelGifImporter(undefined, fakeCodec), await gifFile([{ color: [1, 2, 3], delay: 80 }, { color: [3, 2, 1], delay: 80 }]));
    expect(outcome.ok && outcome.result.warnings).toEqual([]);
  });

  it("should say a non-GIF file isn't a GIF", async () => {
    const outcome = await runImporter(pixelGifImporter(undefined, fakeCodec), binaryFile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13], "fake.gif"));
    expect(outcome).toMatchObject({ ok: false, message: "This isn't a GIF file." });
  });

  it("should refuse files over the size cap before reading them", async () => {
    const huge = { name: "huge.gif", size: 50 * 1024 * 1024, arrayBuffer: () => Promise.reject(new Error("read")) } as unknown as File;
    const outcome = await runImporter(pixelGifImporter(undefined, fakeCodec), huge);
    expect(outcome).toMatchObject({ ok: false, message: expect.stringContaining("up to 20 MB") });
  });
});

describe("fpsForDurations", () => {
  it("should use the most common duration, clamped to 1–30 fps", () => {
    expect([fpsForDurations([125, 125, 500]), fpsForDurations([10]), fpsForDurations([5000])]).toEqual([8, 30, 1]);
  });
});
