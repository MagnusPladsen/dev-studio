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
  /**
   * Files this format refers to, picked or dropped along with the main ones (a map's tilesets and their images).
   * They reach `parseFiles` with the rest; nothing imports them on their own.
   */
  companions?: string[];
  /** For drag-and-drop when several importers take the same extension: is this file one of ours? */
  detect?(file: File, text: string): boolean;
  /** Reads the file. Throws an `ImportError` with a message the user can read when the file can't be used. */
  parse(file: File): Promise<ImportResult<T>>;
  /** What the file picker lets people choose: one file (the default), several, or a whole folder (e.g. an Obsidian vault). */
  pick?: "one" | "many" | "folder";
  /**
   * Reads several files as one import, for formats whose files refer to each other (ADRs superseding each other).
   * Without it each file is parsed on its own and the results are joined.
   */
  parseFiles?(files: File[], options?: ImportOptions): Promise<ImportResult<T>>;
}

export interface ImportOptions {
  /** The person chose to import without the files a `MissingFilesError` asked for. */
  skipMissing: boolean;
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

/**
 * Thrown by `parseFiles` when the files refer to others that weren't picked or dropped with them. The person is asked to
 * add them (or their folder) or to import without them, which runs `parseFiles` again with `skipMissing`.
 */
export class MissingFilesError extends ImportError {
  constructor(readonly names: string[]) {
    super(`These files need ${names.join(", ")}.`);
    this.name = "MissingFilesError";
  }
}
