import { describe, expect, it } from "vitest";
import { scalePixels, type Pixels } from "./pixel-scale";

const R = [255, 0, 0, 255];
const _ = [0, 0, 0, 0];

function img(rows: number[][][]): Pixels {
  const height = rows.length;
  const width = rows[0].length;
  return { width, height, data: new Uint8ClampedArray(rows.flat(2)) };
}

function grid(p: Pixels): string[] {
  const out: string[] = [];
  for (let y = 0; y < p.height; y++) {
    let row = "";
    for (let x = 0; x < p.width; x++) row += p.data[(y * p.width + x) * 4 + 3] ? "#" : ".";
    out.push(row);
  }
  return out;
}

describe("scalePixels", () => {
  it("sharp ×2 turns every pixel into a 2×2 block", () => {
    const out = scalePixels(img([[R, _], [_, R]]), 2, "sharp");
    expect(out.width).toBe(4);
    expect(out.height).toBe(4);
    expect(grid(out)).toEqual(["##..", "##..", "..##", "..##"]);
  });

  it("sharp keeps exact colours", () => {
    const out = scalePixels(img([[[10, 20, 30, 255]]]), 3, "sharp");
    expect([...out.data.slice(0, 4)]).toEqual([10, 20, 30, 255]);
    expect(out.width).toBe(3);
  });

  it("smooth ×2 rounds a diagonal staircase instead of keeping 2×2 steps", () => {
    const stairs = img([
      [R, _, _],
      [R, R, _],
      [R, R, R],
    ]);
    const sharp = grid(scalePixels(stairs, 2, "sharp"));
    const smooth = grid(scalePixels(stairs, 2, "smooth"));
    expect(sharp[0]).toBe("##....");
    // Scale2x fills the inner corner of each step along the diagonal
    expect(smooth).not.toEqual(sharp);
    expect(smooth[1]).toBe("###...");
  });

  it("smooth never invents colours", () => {
    const B = [0, 0, 255, 255];
    const out = scalePixels(img([[R, B, R], [B, R, B], [R, B, R]]), 3, "smooth");
    for (let i = 0; i < out.data.length; i += 4) {
      const c = [...out.data.slice(i, i + 4)].join();
      expect([R.join(), B.join()]).toContain(c);
    }
  });

  it("smooth ×4 is 4× the size and leaves a solid block solid", () => {
    const out = scalePixels(img([[R, R], [R, R]]), 4, "smooth");
    expect(out.width).toBe(8);
    expect(grid(out).every((r) => r === "########")).toBe(true);
  });
});
