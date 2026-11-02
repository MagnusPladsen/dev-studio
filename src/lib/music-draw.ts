import type { MusicNote } from "@/types";

/** A piano-roll cell: `col` counts snap steps from the start, `row` counts pitches from the top. */
export interface GridCell {
  col: number;
  row: number;
}

/** A cell in song terms: the pitch of its row and the beat its column starts on. */
export interface NoteCell {
  pitch: number;
  beat: number;
}

const EPSILON = 1e-6;

/**
 * Every cell on the straight line from `from` to `to`, both ends included, so a fast pointer move
 * that jumps several cells between two samples still reaches each cell it crossed.
 */
export function cellsBetween(from: GridCell, to: GridCell): GridCell[] {
  const steps = Math.max(Math.abs(to.col - from.col), Math.abs(to.row - from.row));
  if (steps === 0) return [{ ...from }];
  return Array.from({ length: steps + 1 }, (_, i) => ({
    col: Math.round(from.col + ((to.col - from.col) * i) / steps),
    row: Math.round(from.row + ((to.row - from.row) * i) / steps),
  }));
}

/** True when `note` sounds on the cell's pitch at the cell's beat. */
export function coversCell(note: MusicNote, cell: NoteCell): boolean {
  return note.pitch === cell.pitch && note.start <= cell.beat + EPSILON && cell.beat < note.start + note.duration - EPSILON;
}

/** Add a note on each cell that no note covers yet. Notes are cut off at the end of the loop. */
export function paintCells(notes: MusicNote[], cells: NoteCell[], noteLength: number, loopLength: number): MusicNote[] {
  return cells.reduce((result, cell) => {
    if (cell.beat >= loopLength || result.some((n) => coversCell(n, cell))) return result;
    const duration = Math.min(noteLength, loopLength - cell.beat);
    return [...result, { pitch: cell.pitch, start: cell.beat, duration, velocity: 0.8 }];
  }, notes);
}

/** Remove every note that covers one of the cells. */
export function eraseCells(notes: MusicNote[], cells: NoteCell[]): MusicNote[] {
  const kept = notes.filter((n) => !cells.some((cell) => coversCell(n, cell)));
  return kept.length === notes.length ? notes : kept;
}
