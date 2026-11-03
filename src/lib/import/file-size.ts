import { ImportError } from "./types";

const megabytes = (bytes: number) => `${Number((bytes / 1024 / 1024).toFixed(1))} MB`;

/** Throws an `ImportError` when `file` is bigger than `maxBytes`, so a huge file never gets read into memory. */
export function assertFileSize(file: Pick<File, "name" | "size">, maxBytes: number): void {
  if (file.size <= maxBytes) return;
  throw new ImportError(`"${file.name}" is too big (${megabytes(file.size)}). The limit is ${megabytes(maxBytes)}.`);
}
