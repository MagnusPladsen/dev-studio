import { ImportError, type Importer } from "@/lib/import";
import { parseCsvTable } from "./csv-table";
import { detectPreset, mappingFor } from "./csv-presets";
import { draftsFromCsv } from "./csv-issues";
import type { IssueDraft } from "./types";

/**
 * Issues from a CSV export of Jira, Linear, GitHub Projects, Trello or this board. The columns are matched by the
 * tool's usual header names; the board then shows a step where they can be matched by hand (`draft.csv`).
 */
export const boardCsvImporter: Importer<IssueDraft> = {
  id: "board-csv",
  label: "Issues CSV (.csv)",
  description: "From Jira, Linear, GitHub Projects, Trello or a spreadsheet",
  accept: [".csv", "text/csv"],
  async parse(file) {
    const source = parseCsvTable(await file.text());
    if (source.headers.length < 1 || source.rows.length === 0) throw new ImportError(`"${file.name}" has no rows under its header line.`);
    return draftsFromCsv(source, mappingFor(detectPreset(source.headers), source.headers));
  },
};
