/** What an importer hands back: the tool's own items (with fresh ids) plus anything the user should know. */
export interface ImportResult<T> {
  items: T[];
  /** Plain-language notes about things that were skipped or changed, e.g. "2 lines pointed at missing cards". */
  warnings: string[];
}

/**
 * One file format a tool can read. A tool lists its importers in one array (see `src/lib/import/README.md`).
 * `T` is the tool's item type, e.g. `Diagram` for the Canvas.
 */
export interface Importer<T> {
  id: string;
  /** Menu label, e.g. "Canvas JSON (.json)". */
  label: string;
  description?: string;
  /** File extensions (".json") and MIME types ("application/json") for the file picker and drag-and-drop. */
  accept: string[];
  /** For drag-and-drop when several importers take the same extension: is this file one of ours? */
  detect?(file: File, text: string): boolean;
  /** Reads the file. Throws an `ImportError` with a message the user can read when the file can't be used. */
  parse(file: File): Promise<ImportResult<T>>;
}

/** How to take an import back out, for imports that aren't part of the tool's `useHistory` (e.g. new assets). */
export interface ImportStep {
  undo(): void;
  redo(): void;
  /** What the tool opened after importing (e.g. the new canvas id); the step only applies while it is open. */
  openedId: string | null;
}

/** An error whose message is written for the user ("This isn't a canvas file"). Other errors get a generic message. */
export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportError";
  }
}
