import { describe, expect, it } from "vitest";
import { getVoxel } from "./grid";
import { edgeDistances, shrinkToFit, spriteToVoxels, thicknessAt, type PixelImage } from "./sprite";

const blank = (width: number, height: number): PixelImage => ({
  width,
  height,
  data: new Uint8ClampedArray(width * height * 4),
});

const setPixel = (image: PixelImage, x: number, y: number, rgba: number[]): void => {
  image.data.set(rgba, (y * image.width + x) * 4);
};

describe("spriteToVoxels", () => {
  it("places the top-left pixel at the top of the model, centred", () => {
    const image = blank(2, 3);
    setPixel(image, 0, 0, [255, 0, 0, 255]);
    const result = spriteToVoxels(image, []);
    if (!result.ok) throw new Error("expected ok");
    expect(result.grid.size).toEqual([8, 8, 8]);
    expect(getVoxel(result.grid, 3, 2, 4)).toBe(1);
    expect(result.colors).toEqual(["#ff0000"]);
  });

  it("rejects sprites larger than 64", () => {
    expect(spriteToVoxels(blank(65, 10), [])).toEqual({ ok: false, reason: "too-large" });
  });

  it("rejects fully transparent sprites", () => {
    expect(spriteToVoxels(blank(4, 4), [])).toEqual({ ok: false, reason: "empty" });
  });

  it("skips pixels with alpha below 128", () => {
    const image = blank(1, 1);
    setPixel(image, 0, 0, [255, 0, 0, 127]);
    expect(spriteToVoxels(image, [])).toEqual({ ok: false, reason: "empty" });
  });

  it("caps the palette at 255 colours", () => {
    const image = blank(20, 15);
    for (let index = 0; index < 300; index++) {
      setPixel(image, index % 20, Math.floor(index / 20), [index % 256, Math.floor(index / 256), 7, 255]);
    }
    const result = spriteToVoxels(image, []);
    if (!result.ok) throw new Error("expected ok");
    expect(result.colors).toHaveLength(255);
    const solid = Array.from(result.grid.data).filter((value) => value !== 0);
    expect(solid).toHaveLength(300);
    expect(Math.min(...solid)).toBeGreaterThanOrEqual(1);
    expect(Math.max(...solid)).toBeLessThanOrEqual(255);
  });
});

const solid = (width: number, height: number, rgba = [200, 40, 40, 255]): PixelImage => {
  const image = blank(width, height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) setPixel(image, x, y, rgba);
  return image;
};

/** z layers filled at one sprite pixel (x from the left of the model's grid, y from the bottom). */
const column = (grid: { size: [number, number, number] } & Parameters<typeof getVoxel>[0], x: number, y: number): number[] => {
  const zs: number[] = [];
  for (let z = 0; z < grid.size[2]; z++) if (getVoxel(grid, x, y, z) !== 0) zs.push(z);
  return zs;
};

describe("depth", () => {
  it("flat extrudes every pixel to the chosen depth", () => {
    const result = spriteToVoxels(solid(4, 4), [], { depth: 3 });
    if (!result.ok) throw new Error("expected ok");
    const filled = Array.from(result.grid.data).filter((value) => value !== 0);
    expect(filled).toHaveLength(4 * 4 * 3);
    expect(column(result.grid, 2, 0)).toEqual([3, 4, 5]);
  });

  it("depth 1 matches the original one-cube-deep import", () => {
    const image = solid(3, 2);
    const one = spriteToVoxels(image, [], { depth: 1, shape: "puffy" });
    const plain = spriteToVoxels(image, []);
    expect(one).toEqual(plain);
  });

  it("keeps the grid big enough for the depth", () => {
    const result = spriteToVoxels(solid(2, 2), [], { depth: 8 });
    if (!result.ok) throw new Error("expected ok");
    expect(result.grid.size[2]).toBeGreaterThanOrEqual(8);
  });
});

describe("puffy shape", () => {
  it("is thinnest at the outline and thickest in the middle", () => {
    const d = edgeDistances(solid(9, 9));
    expect(d[0]).toBe(1);
    expect(d[4 * 9 + 4]).toBe(5);
    expect(thicknessAt(1, 8, "puffy")).toBe(2);
    expect(thicknessAt(5, 8, "puffy")).toBe(8);
    expect(thicknessAt(5, 8, "flat")).toBe(8);
  });

  it("bulges equally to the front and back", () => {
    const result = spriteToVoxels(solid(9, 9), [], { depth: 6, shape: "puffy" });
    if (!result.ok) throw new Error("expected ok");
    const middle = result.grid.size[2] / 2; // the plane between layers middle-1 and middle
    for (let y = 0; y < 9; y++) {
      for (let x = 0; x < result.grid.size[0]; x++) {
        const zs = column(result.grid, x, y);
        if (!zs.length) continue;
        expect(middle - zs[0]).toBe(zs[zs.length - 1] + 1 - middle);
      }
    }
    const left = Math.floor((result.grid.size[0] - 9) / 2);
    const edge = column(result.grid, left, 0);
    const centre = column(result.grid, left + 4, 4);
    expect(edge.length).toBeLessThan(centre.length);
  });

  it("treats transparent holes as edges", () => {
    const image = solid(5, 5);
    setPixel(image, 2, 2, [0, 0, 0, 0]);
    const d = edgeDistances(image);
    expect(d[2 * 5 + 1]).toBe(1);
    expect(d[2 * 5 + 2]).toBe(0);
  });
});

describe("back side", () => {
  it("mirror keeps the sprite's colours only", () => {
    const image = solid(4, 4);
    setPixel(image, 0, 0, [10, 200, 10, 255]);
    const result = spriteToVoxels(image, [], { depth: 4, shape: "puffy", back: "mirror" });
    if (!result.ok) throw new Error("expected ok");
    expect(result.colors).toHaveLength(2);
  });

  it("darker shades the back half", () => {
    const result = spriteToVoxels(solid(2, 2, [200, 100, 50, 255]), [], { depth: 4, back: "darker" });
    if (!result.ok) throw new Error("expected ok");
    expect(result.colors).toEqual(["#c86432", "#904824"]);
    const zs = column(result.grid, 3, 0);
    expect(zs.map((z) => getVoxel(result.grid, 3, 0, z))).toEqual([2, 2, 1, 1]);
  });
});

describe("shrinkToFit", () => {
  it("shrinks a 128×64 sprite to 64×32 and leaves small ones alone", () => {
    const big = solid(128, 64);
    const small = shrinkToFit(big);
    expect([small.width, small.height]).toEqual([64, 32]);
    expect(spriteToVoxels(small, []).ok).toBe(true);
    const fits = solid(10, 10);
    expect(shrinkToFit(fits)).toBe(fits);
  });

  it("keeps the colours it samples", () => {
    const image = blank(100, 2);
    for (let x = 0; x < 100; x++) {
      setPixel(image, x, 0, x < 50 ? [255, 0, 0, 255] : [0, 0, 255, 255]);
      setPixel(image, x, 1, x < 50 ? [255, 0, 0, 255] : [0, 0, 255, 255]);
    }
    const result = spriteToVoxels(shrinkToFit(image), []);
    if (!result.ok) throw new Error("expected ok");
    expect(result.colors.sort()).toEqual(["#0000ff", "#ff0000"]);
  });
});
