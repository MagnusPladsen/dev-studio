/** The last part of a path as written inside a file ("../tiles/grass.png" → "grass.png"). */
export function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

/**
 * The file a path inside another file points at. Paths are relative to where the file was saved, which a browser never
 * knows, so files are matched on their name alone (ignoring case).
 */
export function findCompanion(files: File[], path: string): File | undefined {
  const name = baseName(path).toLowerCase();
  return files.find((file) => file.name.toLowerCase() === name);
}
