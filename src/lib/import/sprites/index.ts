import type { Importer } from "@/lib/import";
import { atlasImporter } from "./atlas";
import { sheetSliceImporter } from "./slice";
import type { SheetImport } from "./sheet-import";

export { atlasImporter, readAtlas } from "./atlas";
export { gridCells, guessGrid, sheetSliceImporter, type SheetGrid } from "./slice";
export type { SheetImport } from "./sheet-import";

/** What Sprite Sheets' Import menu offers, in menu order. Add an importer here to offer a new format. */
export const SPRITE_SHEET_IMPORTERS: Importer<SheetImport>[] = [sheetSliceImporter(), atlasImporter()];
