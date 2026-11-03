import type { Importer } from "../types";
import { ImportError } from "../types";
import { browserImageCodec, type ImageCodec } from "../image/codec";
import { cropImage } from "../image/pixel-image";
import { nameFromFile } from "../pixel-art/sprite-from-images";
import { STILL_IMAGE_ACCEPT } from "../pixel-art/image";
import { assertFrameSize, buildSheetImport, MAX_SHEET_FRAMES, skippedWarning, type SheetImport } from "./sheet-import";

/** How a sheet image is cut up: equal cells with `spacing` between them and `margin` around the edge. */
export interface SheetGrid {
  cellWidth: number;
  cellHeight: number;
  spacing: number;
  margin: number;
}

export interface Cell {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The whole cells that fit, row by row. */
export function gridCells(width: number, height: number, grid: SheetGrid): Cell[] {
  const { cellWidth, cellHeight, spacing, margin } = grid;
  if (cellWidth < 1 || cellHeight < 1) return [];
  const columns = Math.max(0, Math.floor((width - 2 * margin + spacing) / (cellWidth + spacing)));
  const rows = Math.max(0, Math.floor((height - 2 * margin + spacing) / (cellHeight + spacing)));
  const cells: Cell[] = [];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      cells.push({ x: margin + column * (cellWidth + spacing), y: margin + row * (cellHeight + spacing), width: cellWidth, height: cellHeight });
    }
  }
  return cells;
}

const COMMON_CELLS = [64, 48, 32, 24, 16, 8];

/**
 * A first guess at the grid: a strip of square frames, or the biggest common cell size that divides the image evenly.
 * Null when nothing divides evenly; the user then types the cell size.
 */
export function guessGrid(width: number, height: number): SheetGrid | null {
  const square = (side: number): SheetGrid => ({ cellWidth: side, cellHeight: side, spacing: 0, margin: 0 });
  if (width > height && width % height === 0) return square(height);
  if (height > width && height % width === 0) return square(width);
  const common = COMMON_CELLS.find((side) => side < Math.max(width, height) && width % side === 0 && height % side === 0);
  return common ? square(common) : null;
}

/** A sprite sheet image cut into frames with `grid`: one new sprite (empty cells left out) in one new sheet. */
export function sheetSliceImporter(grid: SheetGrid | null = null, codec: ImageCodec = browserImageCodec): Importer<SheetImport> {
  return {
    id: "sheet-slice",
    label: "Sprite sheet image (.png)",
    description: "Cut into frames on a grid you set",
    accept: STILL_IMAGE_ACCEPT,
    async parse(file) {
      const image = await codec.decode(file);
      const chosen = grid ?? guessGrid(image.width, image.height);
      if (!chosen) throw new ImportError("Set the cell size to cut this image into frames.");
      assertFrameSize(chosen.cellWidth, chosen.cellHeight);
      const cells = gridCells(image.width, image.height, chosen);
      if (!cells.length) throw new ImportError(`No ${chosen.cellWidth}×${chosen.cellHeight} cells fit in this ${image.width}×${image.height} image.`);
      if (cells.length > MAX_SHEET_FRAMES) throw new ImportError(`That cuts into ${cells.length} frames. Up to ${MAX_SHEET_FRAMES} can be imported; use bigger cells.`);
      const name = nameFromFile(file.name, "Imported sheet");
      const frames = cells.map((cell) => cropImage(image, cell.x, cell.y, cell.width, cell.height));
      const { item, skipped } = buildSheetImport(name, [{ name, frames }], 1, codec);
      return { items: [item], warnings: skippedWarning(skipped) };
    },
  };
}
