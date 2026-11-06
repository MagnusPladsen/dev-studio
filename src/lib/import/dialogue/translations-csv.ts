import { ImportError, type Importer } from "@/lib/import/types";
import { assertFileSize } from "@/lib/import/file-size";
import { readLocalisationCsv, type TranslationSheet } from "@/lib/dialogue/localisation";

const MAX_BYTES = 5 * 1024 * 1024;

/** Translations for the open dialogue, from a filled-in Localisation CSV. The editor merges them by text id. */
export const translationsCsvImporter: Importer<TranslationSheet> = {
  id: "dialogue-translations",
  label: "Translations (.csv)",
  description: "A filled-in Localisation CSV, into this dialogue",
  accept: [".csv", "text/csv"],
  async parse(file) {
    assertFileSize(file, MAX_BYTES);
    const sheet = readLocalisationCsv(await file.text());
    if (sheet.rows.length === 0) throw new ImportError(`"${file.name}" has no rows under its header line.`);
    if (sheet.languages.length === 0) throw new ImportError(`"${file.name}" has no language columns. Add one (e.g. “nb”) next to “source”.`);
    return { items: [sheet], warnings: [] };
  },
};
