import { describe, expect, it } from "vitest";
import { addOutline, cameraBasis, crispAlpha, directions, fitFrame, occupiedBounds, renderSpriteName, turntableYaws } from "./render";
import type { VoxelGrid } from "./grid";

const close = (a: number[], b: number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 6));

describe("directions", () => {
  it("starts at the front and steps evenly", () => {
    expect(directions(1)).toEqual([{ yaw: 0, label: "Front" }]);
    expect(directions(4).map((d) => [d.yaw, d.label])).toEqual([
      [0, "Front"],
      [90, "Right"],
      [180, "Back"],
      [270, "Left"],
    ]);
    expect(directions(8).map((d) => d.yaw)).toEqual([0, 45, 90, 135, 180, 225, 270, 315]);
    expect(directions(8)[1].label).toBe("Front-right");
  });

  it("turntable covers a full turn without repeating the first frame", () => {
    expect(turntableYaws(12)).toHaveLength(12);
    expect(turntableYaws(12)[11]).toBe(330);
  });
});

describe("cameraBasis", () => {
  it("front view looks down -Z with +X to the right", () => {
    const b = cameraBasis(0, 0);
    close(b.toCamera, [0, 0, 1]);
    close(b.right, [1, 0, 0]);
    close(b.up, [0, 1, 0]);
  });

  it("keeps the three axes perpendicular at any angle", () => {
    const b = cameraBasis(135, 30);
    const dot = (a: number[], c: number[]) => a[0] * c[0] + a[1] * c[1] + a[2] * c[2];
    expect(dot(b.right, b.up)).toBeCloseTo(0, 6);
    expect(dot(b.right, b.toCamera)).toBeCloseTo(0, 6);
    expect(dot(b.up, b.toCamera)).toBeCloseTo(0, 6);
  });
});

function grid(size: [number, number, number], filled: [number, number, number][]): VoxelGrid {
  const data = new Uint8Array(size[0] * size[1] * size[2]);
  for (const [x, y, z] of filled) data[x + y * size[0] + z * size[0] * size[1]] = 1;
  return { size, data };
}

describe("occupiedBounds", () => {
  it("returns null for an empty model", () => {
    expect(occupiedBounds(grid([4, 4, 4], []))).toBeNull();
  });

  it("uses mesh coordinates: x/z centred on the grid, y from the floor", () => {
    expect(occupiedBounds(grid([4, 4, 4], [[0, 0, 0], [1, 2, 3]]))).toEqual({ min: [-2, 0, -2], max: [0, 3, 2] });
  });
});

describe("fitFrame", () => {
  it("is square, centred on the model and leaves room for the outline", () => {
    const f = fitFrame({ min: [-1, 0, -1], max: [1, 4, 1] }, [0], 0, 32, 1.5);
    expect(f.right - f.left).toBeCloseTo(f.top - f.bottom, 6);
    expect((f.top + f.bottom) / 2).toBeCloseTo(2, 6);
    expect(f.top - f.bottom).toBeGreaterThan(4);
  });

  it("uses one window for every direction, big enough for the widest", () => {
    const wide = { min: [-4, 0, -0.5], max: [4, 1, 0.5] } as { min: [number, number, number]; max: [number, number, number] };
    const front = fitFrame(wide, [0], 0, 32, 0);
    const all = fitFrame(wide, [0, 90], 0, 32, 0);
    expect(all.right - all.left).toBeCloseTo(front.right - front.left, 6);
    const side = fitFrame(wide, [90], 0, 32, 0);
    expect(side.right - side.left).toBeLessThan(all.right - all.left);
  });
});

describe("crispAlpha and addOutline", () => {
  it("snaps alpha and clears colour from see-through pixels", () => {
    const d = new Uint8ClampedArray([10, 20, 30, 200, 10, 20, 30, 40]);
    crispAlpha(d);
    expect([...d]).toEqual([10, 20, 30, 255, 0, 0, 0, 0]);
  });

  it("outlines the empty pixels touching the shape, not diagonals", () => {
    // 3×3 with only the centre filled
    const d = new Uint8ClampedArray(9 * 4);
    d.set([255, 255, 255, 255], 4 * 4);
    addOutline(d, 3, 3, [1, 2, 3]);
    const alpha = Array.from({ length: 9 }, (_, p) => (d[p * 4 + 3] ? 1 : 0));
    expect(alpha).toEqual([0, 1, 0, 1, 1, 1, 0, 1, 0]);
    expect([...d.slice(4, 8)]).toEqual([1, 2, 3, 255]);
  });
});

describe("renderSpriteName", () => {
  it("names the sprite after the model and direction count", () => {
    expect(renderSpriteName("Pip (3D)", 8)).toBe("Pip (3D) (8 directions)");
    expect(renderSpriteName("Coin", 1)).toBe("Coin (render)");
    expect(renderSpriteName("  ", 4)).toBe("Untitled model (4 directions)");
  });
});
