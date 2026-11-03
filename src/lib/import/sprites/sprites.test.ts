import { describe, expect, it } from "vitest";
import { runImporter } from "@/lib/import";
import { textFile } from "@/lib/import/test-helpers";
import { decodeFake, fakeCodec, imageFile, makeImage, pixelAt } from "../image/test-images";
import { atlasImporter, groupFrames, readAtlas } from "./atlas";
import { gridCells, guessGrid, sheetSliceImporter } from "./slice";

/** A 3×2 grid of 4×4 cells with 1 px spacing and a 2 px margin; cell (column, row) is coloured column*80, row*80; the last cell is empty. */
const sheet = makeImage(2 * 2 + 3 * 4 + 2, 2 * 2 + 2 * 4 + 1, (x, y) => {
  const column = Math.floor((x - 2) / 5);
  const row = Math.floor((y - 2) / 5);
  const inCell = x >= 2 && y >= 2 && (x - 2) % 5 < 4 && (y - 2) % 5 < 4 && column < 3 && row < 2;
  if (!inCell || (column === 2 && row === 1)) return [0, 0, 0, 0];
  return [column * 80, row * 80, 7, 255];
});
const grid = { cellWidth: 4, cellHeight: 4, spacing: 1, margin: 2 };

describe("gridCells", () => {
  it("should list whole cells row by row, honouring spacing and margin", () => {
    const cells = gridCells(sheet.width, sheet.height, grid);
    expect(cells).toHaveLength(6);
    expect(cells[4]).toEqual({ x: 7, y: 7, width: 4, height: 4 });
  });

  it("should return nothing for a zero cell size", () => {
    expect(gridCells(10, 10, { ...grid, cellWidth: 0 })).toEqual([]);
  });
});

describe("guessGrid", () => {
  it("should read a horizontal strip as square frames", () => {
    expect(guessGrid(128, 32)).toMatchObject({ cellWidth: 32, cellHeight: 32 });
  });

  it("should fall back to the biggest common size that divides both sides", () => {
    expect(guessGrid(96, 48 + 96)).toMatchObject({ cellWidth: 48 });
  });

  it("should give up when nothing divides evenly", () => {
    expect(guessGrid(37, 23)).toBeNull();
  });
});

describe("Sprite sheet slicing", () => {
  it("should cut the image into one sprite's frames and leave out empty cells", async () => {
    const outcome = await runImporter(sheetSliceImporter(grid, fakeCodec), imageFile(sheet, "slime.png"));
    if (!outcome.ok) throw new Error(outcome.message);
    const [{ sheet: newSheet, sprites }] = outcome.result.items;
    expect(sprites).toHaveLength(1);
    expect(newSheet.spriteIds).toEqual([sprites[0].id]);
    expect(sprites[0].frames).toHaveLength(5);
    expect(pixelAt(decodeFake(sprites[0].frames[4].pixels), 0, 0)).toEqual([80, 80, 7, 255]);
    expect(outcome.result.warnings).toEqual(["Left out 1 empty frame"]);
  });

  it("should refuse cells bigger than a sprite can be", async () => {
    const outcome = await runImporter(sheetSliceImporter({ ...grid, cellWidth: 300 }, fakeCodec), imageFile(makeImage(600, 10, () => [1, 1, 1, 255])));
    expect(outcome).toMatchObject({ ok: false, message: expect.stringContaining("Sprites go up to 256×256") });
  });

  it("should say so when no cell fits", async () => {
    const outcome = await runImporter(sheetSliceImporter({ ...grid, cellWidth: 40 }, fakeCodec), imageFile(sheet));
    expect(outcome).toMatchObject({ ok: false, message: expect.stringContaining("No 40×4 cells fit") });
  });
});

/** What Export → Atlas JSON writes (see `exportAtlas` in the Sprite Sheets page). */
function exportedAtlas(frames: Record<string, { x: number; y: number; w: number; h: number }>, scale = 1) {
  return textFile(JSON.stringify({ frames, meta: { image: "heroes.png", size: { w: 20, h: 10 }, scale } }, null, 2), "heroes.json");
}

const atlasImage = makeImage(20, 10, (x, y) => (y < 5 ? [x * 10, 0, 0, 255] : [0, x * 10, 0, 255]));
const atlasFrames = {
  Hero_0: { x: 1, y: 1, w: 3, h: 3 },
  Hero_1: { x: 5, y: 1, w: 3, h: 3 },
  Slime_0: { x: 1, y: 5, w: 4, h: 4 },
};

describe("Atlas re-import", () => {
  it("should rebuild one sprite per name with its frames, and the sheet's padding", async () => {
    const outcome = await runImporter(atlasImporter(atlasImage, fakeCodec), exportedAtlas(atlasFrames));
    if (!outcome.ok) throw new Error(outcome.message);
    const [{ sheet: newSheet, sprites }] = outcome.result.items;
    expect(sprites.map((sprite) => [sprite.name, sprite.frames.length, sprite.width])).toEqual([["Hero", 2, 3], ["Slime", 1, 4]]);
    expect(newSheet.padding).toBe(1);
    expect(pixelAt(decodeFake(sprites[0].frames[1].pixels), 0, 0)).toEqual([50, 0, 0, 255]);
  });

  it("should shrink a 2× export back to 1×", async () => {
    const big = makeImage(8, 4, (x) => [x < 4 ? 200 : 100, 0, 0, 255]);
    const outcome = await runImporter(atlasImporter(big, fakeCodec), exportedAtlas({ Dot_0: { x: 0, y: 0, w: 4, h: 4 } }, 2));
    if (!outcome.ok) throw new Error(outcome.message);
    expect(outcome.result.items[0].sprites[0].width).toBe(2);
    expect(outcome.result.warnings).toContain("This atlas was exported at 2×; frames were shrunk back to 1×");
  });

  it("should ask for the PNG when it only has the JSON", async () => {
    const outcome = await runImporter(atlasImporter(null, fakeCodec), exportedAtlas(atlasFrames));
    expect(outcome).toMatchObject({ ok: false, message: 'Pick the atlas\'s image too ("heroes.png").' });
  });

  it("should recognise atlases on drop and turn away other JSON", () => {
    const importer = atlasImporter();
    expect(importer.detect?.(textFile(""), JSON.stringify({ frames: atlasFrames }))).toBe(true);
    expect(importer.detect?.(textFile(""), JSON.stringify({ nodes: [] }))).toBe(false);
  });

  it("should read TexturePacker's array format", () => {
    const atlas = readAtlas({ frames: [{ filename: "run_2.png", frame: { x: 0, y: 0, w: 2, h: 2 } }], meta: { scale: "1" } });
    expect(atlas.frames).toEqual([{ key: "run_2.png", x: 0, y: 0, w: 2, h: 2 }]);
    expect(groupFrames(atlas.frames)[0].name).toBe("run");
  });

  it("should refuse damaged rectangles", () => {
    expect(() => readAtlas({ frames: { a: { x: 0, y: 0, w: "3", h: 3 } } })).toThrow(/isn't an atlas/);
  });
});
