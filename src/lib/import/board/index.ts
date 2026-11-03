import type { Importer } from "@/lib/import";
import { boardCsvImporter } from "./board-csv";
import { boardJsonImporter } from "./board-json";
import type { IssueDraft } from "./types";

export { mergeIntoBoard } from "./merge";
export { draftsFromCsv } from "./csv-issues";
export { CSV_FIELDS, CSV_FIELD_LABELS, CSV_PRESETS, detectPreset, mappingFor, presetById, type CsvMapping, type CsvPresetId } from "./csv-presets";
export type { CsvSource, IssueDraft } from "./types";

/** What the Task Board's Import menu offers, in menu order. Add an importer here to offer a new format. */
export const BOARD_IMPORTERS: Importer<IssueDraft>[] = [boardCsvImporter, boardJsonImporter];
