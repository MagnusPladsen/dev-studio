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
