import { reidentify, type ReidentifyOptions } from "./reidentify";
import type { ImportResult, Importer } from "./types";

export interface JsonReimportOptions<T> extends ReidentifyOptions {
  id: string;
  label: string;
  description?: string;
  /** Pulls the tool's items out of the parsed file, or throws an `ImportError` saying why it isn't one. */
  read(data: unknown): T[];
  /**
   * Optional clean-up after the ids are fresh, e.g. dropping links to things that weren't imported.
   * `isImported(id)` is true for the new id of anything inside the file.
   */
  finish?(items: T[], context: { isImported(id: string): boolean }): ImportResult<T>;
}

/** An importer for a tool's own JSON export: same items back, every id new, references inside the file kept. */
export function jsonReimporter<T>(options: JsonReimportOptions<T>): Importer<T> {
  const { id, label, description, read, finish, refKeys } = options;
  return {
    id,
    label,
    description,
    accept: [".json", "application/json"],
    detect(_file, text) {
      try {
        return read(JSON.parse(text)).length > 0;
      } catch {
        return false;
      }
    },
    async parse(file) {
      const fresh = reidentify(read(JSON.parse(await file.text())), { refKeys });
      const imported = new Set(fresh.ids.values());
      if (!finish) return { items: fresh.items, warnings: [] };
      return finish(fresh.items, { isImported: (newId) => imported.has(newId) });
    },
  };
}

/** For `read`: one exported item, or an array of them. */
export function oneOrMany(data: unknown): unknown[] {
  return Array.isArray(data) ? data : [data];
}
