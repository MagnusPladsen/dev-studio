import { expect } from "vitest";
import type { ExportFile } from "./types";

/** For tests: an export's files by path. */
export const fileMap = (files: ExportFile[]): Map<string, string | Uint8Array> => new Map(files.map((file) => [file.path, file.data]));

export function textOf(files: Map<string, string | Uint8Array>, path: string): string {
  const data = files.get(path);
  if (typeof data !== "string") throw new Error(`${path} is ${data ? "binary" : "missing"}; have ${[...files.keys()].join(", ")}`);
  return data;
}

/**
 * Compares each text file with its golden copy in `__golden__/<engine>/` (`npm test -- -u` rewrites them after a
 * deliberate change), and lists every file, binary ones included, so added or dropped files show up too. Golden `.tsx`
 * files are stored as `.tsx.xml` so TypeScript doesn't read them as code.
 */
export async function expectGolden(engine: string, files: ExportFile[]): Promise<void> {
  for (const file of files) if (typeof file.data === "string") await expect(file.data).toMatchFileSnapshot(`./__golden__/${engine}/${file.path.replace(/\.tsx$/, ".tsx.xml")}`);
  const listing = files.map((file) => `${file.path}${typeof file.data === "string" ? "" : " (binary)"}`).join("\n");
  await expect(`${listing}\n`).toMatchFileSnapshot(`./__golden__/${engine}/${files[0].path.split("/")[0]}.files.txt`);
}
