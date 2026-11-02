import { describe, expect, it } from "vitest";
import type { MusicNote } from "@/types";
import { cellsBetween, coversCell, eraseCells, paintCells } from "@/lib/music-draw";

function note(pitch: number, start: number, duration = 0.5): MusicNote {
  return { pitch, start, duration, velocity: 0.8 };
}

describe("cellsBetween", () => {
  it("should return the single cell when both ends are the same cell", () => {
    expect(cellsBetween({ col: 3, row: 4 }, { col: 3, row: 4 })).toEqual([{ col: 3, row: 4 }]);
  });

  it("should list every cell in order when moving right", () => {
    expect(cellsBetween({ col: 0, row: 2 }, { col: 3, row: 2 })).toEqual([
      { col: 0, row: 2 },
      { col: 1, row: 2 },
      { col: 2, row: 2 },
      { col: 3, row: 2 },
    ]);
  });

  it("should list every cell in order when moving left", () => {
    expect(cellsBetween({ col: 5, row: 1 }, { col: 2, row: 1 }).map((c) => c.col)).toEqual([5, 4, 3, 2]);
  });

  it("should list every cell in order when moving down", () => {
    expect(cellsBetween({ col: 1, row: 0 }, { col: 1, row: 3 }).map((c) => c.row)).toEqual([0, 1, 2, 3]);
  });

  it("should list every cell in order when moving up", () => {
    expect(cellsBetween({ col: 1, row: 6 }, { col: 1, row: 4 }).map((c) => c.row)).toEqual([6, 5, 4]);
  });

  it("should step one cell at a time when moving diagonally", () => {
    const cells = cellsBetween({ col: 0, row: 0 }, { col: 4, row: 2 });
    expect(cells).toHaveLength(5);
    cells.slice(1).forEach((cell, i) => {
      expect(Math.abs(cell.col - cells[i].col)).toBeLessThanOrEqual(1);
      expect(Math.abs(cell.row - cells[i].row)).toBeLessThanOrEqual(1);
    });
    expect(cells.at(-1)).toEqual({ col: 4, row: 2 });
  });
});

describe("coversCell", () => {
  it("should be true when the beat falls inside the note on the same pitch", () => {
    expect(coversCell(note(60, 1, 1), { pitch: 60, beat: 1.5 })).toBe(true);
  });

  it("should be false when the beat is where the note ends", () => {
    expect(coversCell(note(60, 1, 1), { pitch: 60, beat: 2 })).toBe(false);
  });

  it("should be false when the pitch differs", () => {
    expect(coversCell(note(60, 1, 1), { pitch: 61, beat: 1 })).toBe(false);
  });
});

describe("paintCells", () => {
  it("should add a note on each free cell when painting a row", () => {
    const painted = paintCells([], [{ pitch: 60, beat: 0 }, { pitch: 60, beat: 0.5 }], 0.5, 8);
    expect(painted).toEqual([note(60, 0), note(60, 0.5)]);
  });

  it("should skip cells a note already covers when the note length is longer than a cell", () => {
    const cells = [0, 0.5, 1, 1.5].map((beat) => ({ pitch: 60, beat }));
    expect(paintCells([], cells, 1, 8).map((n) => n.start)).toEqual([0, 1]);
  });

  it("should keep existing notes untouched when a cell is already taken", () => {
    const existing = [note(60, 0, 2)];
    expect(paintCells(existing, [{ pitch: 60, beat: 1 }], 0.5, 8)).toBe(existing);
  });

  it("should shorten the note when it would run past the end of the loop", () => {
    expect(paintCells([], [{ pitch: 60, beat: 7.5 }], 2, 8)).toEqual([note(60, 7.5, 0.5)]);
  });

  it("should ignore cells when they start after the loop", () => {
    expect(paintCells([], [{ pitch: 60, beat: 8 }], 0.5, 8)).toEqual([]);
  });
});

describe("eraseCells", () => {
  it("should remove every note when the path crosses it", () => {
    const notes = [note(60, 0, 2), note(62, 0), note(64, 3)];
    expect(eraseCells(notes, [{ pitch: 60, beat: 1.5 }, { pitch: 62, beat: 0 }])).toEqual([note(64, 3)]);
  });

  it("should return the same array when nothing is under the path", () => {
    const notes = [note(60, 0)];
    expect(eraseCells(notes, [{ pitch: 60, beat: 1 }])).toBe(notes);
  });
});
