import { ImportError, type ImportResult, type Importer } from "./types";

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

/** Does the picker filter (`accept`) let this file through? Matches extensions, exact MIME types and `type/*`. */
export function acceptsFile(accept: string[], file: Pick<File, "name" | "type">): boolean {
  const extension = extensionOf(file.name);
  const lowerName = file.name.toLowerCase();
  return accept.some((rule) => {
    const lower = rule.toLowerCase();
    if (lower.startsWith(".")) return lowerName.endsWith(lower) || extension === lower;
    if (lower.endsWith("/*")) return file.type.startsWith(lower.slice(0, -1));
    return file.type === lower;
  });
}

/** Could a dragged item (only its MIME type is known while dragging) be one of these importers' files? */
export function acceptsDragType(importers: Importer<unknown>[], mimeType: string): boolean {
  if (!mimeType) return true;
  return importers.some((importer) => acceptsFile(importer.accept, { name: "", type: mimeType }));
}

/** Picks the importer for a dropped file: the first whose `accept` matches and whose `detect` (if any) says yes. */
export async function findImporter<T>(importers: Importer<T>[], file: File): Promise<Importer<T> | null> {
  const candidates = importers.filter((importer) => acceptsFile(importer.accept, file));
  if (candidates.length <= 1 || !candidates.some((importer) => importer.detect)) return candidates[0] ?? null;
  const text = await file.text();
  return candidates.find((importer) => !importer.detect || importer.detect(file, text)) ?? null;
}

/** The message shown when an import fails: the importer's own words, or a plain fallback. */
export function importErrorMessage(error: unknown, fileName: string): string {
  if (error instanceof ImportError) return error.message;
  if (error instanceof SyntaxError) return `"${fileName}" isn't valid JSON. Was it changed after export?`;
  return `Couldn't read "${fileName}". It may be damaged or in a format this tool doesn't know.`;
}

export type ImportOutcome<T> = { ok: true; result: ImportResult<T> } | { ok: false; message: string };

export async function runImporter<T>(importer: Importer<T>, file: File): Promise<ImportOutcome<T>> {
  try {
    const result = await importer.parse(file);
    if (result.items.length === 0) return { ok: false, message: `"${file.name}" has nothing to import.` };
    return { ok: true, result };
  } catch (error) {
    return { ok: false, message: importErrorMessage(error, file.name) };
  }
}

/** A file inside a hidden folder of a picked folder (`.obsidian/`, `.git/`): settings, never content. */
function isHiddenPath(file: File): boolean {
  return (file.webkitRelativePath || file.name).split("/").some((part) => part.startsWith("."));
}

function skippedFilesWarning(skipped: File[]): string {
  const names = skipped.slice(0, 3).map((file) => `"${file.name}"`).join(", ");
  const more = skipped.length > 3 ? ` and ${skipped.length - 3} more` : "";
  return `Skipped ${skipped.length} ${skipped.length === 1 ? "file this tool can't read" : "files this tool can't read"}: ${names}${more}`;
}

async function parseEach<T>(importer: Importer<T>, files: File[]): Promise<ImportResult<T>> {
  if (importer.parseFiles) return importer.parseFiles(files);
  const items: T[] = [];
  const warnings: string[] = [];
  for (const file of files) {
    try {
      const result = await importer.parse(file);
      items.push(...result.items);
      warnings.push(...result.warnings);
    } catch (error) {
      warnings.push(importErrorMessage(error, file.name));
    }
  }
  return { items, warnings };
}

/**
 * Imports several files (a multi-select, a folder, a drop) with one importer, as one import. Files it doesn't accept
 * are skipped with a warning; files in hidden folders (`.obsidian/`) are left out quietly.
 */
export async function runImporterOnFiles<T>(importer: Importer<T>, files: File[]): Promise<ImportOutcome<T>> {
  if (files.length === 1 && !importer.parseFiles) return runImporter(importer, files[0]);
  const visible = files.filter((file) => !isHiddenPath(file));
  const readable = visible.filter((file) => acceptsFile(importer.accept, file));
  const skipped = visible.filter((file) => !readable.includes(file));
  if (!readable.length) return { ok: false, message: visible.length ? `None of these files can be imported here. ${skippedFilesWarning(skipped)}.` : "There were no files to import." };
  try {
    const result = await parseEach(importer, readable);
    const warnings = skipped.length ? [skippedFilesWarning(skipped), ...result.warnings] : result.warnings;
    if (result.items.length === 0) return { ok: false, message: warnings[0] ?? "There was nothing to import in these files." };
    return { ok: true, result: { items: result.items, warnings } };
  } catch (error) {
    return { ok: false, message: importErrorMessage(error, readable.length === 1 ? readable[0].name : "these files") };
  }
}
