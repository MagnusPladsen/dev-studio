import type { MusicTrack } from "@/types";
import { ImportError, jsonReimporter, oneOrMany, type Importer } from "@/lib/import";
import { assertFileSize } from "@/lib/import/file-size";

const MAX_BYTES = 5 * 1024 * 1024;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

const isNote = (value: unknown) =>
  isRecord(value) && ["pitch", "start", "duration", "velocity"].every((key) => typeof value[key] === "number");

function isChannel(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.instrument === "string" &&
    Array.isArray(value.patterns) &&
    value.patterns.every((pattern) => isRecord(pattern) && Array.isArray(pattern.notes) && pattern.notes.every(isNote))
  );
}

function readSong(value: unknown): MusicTrack {
  if (!isRecord(value) || typeof value.bpm !== "number" || !Array.isArray(value.channels)) {
    throw new ImportError("This isn't a song file. Export one from the Music composer with Export → Song JSON.");
  }
  if (!value.channels.every(isChannel)) throw new ImportError("This song file is damaged: some channels or notes are incomplete.");
  return {
    ...(value as unknown as MusicTrack),
    id: typeof value.id === "string" ? value.id : "song",
    name: typeof value.name === "string" && value.name.trim() ? value.name : "Imported song",
    tags: Array.isArray(value.tags) ? value.tags.filter((tag): tag is string => typeof tag === "string") : [],
  };
}

const reimporter = jsonReimporter<MusicTrack>({
  id: "song-json",
  label: "Song JSON (.json)",
  description: "A song exported from here, as a new song",
  read: (data) => oneOrMany(data).map(readSong),
});

/** Re-imports the Music composer's own Song JSON export. */
export const songJsonImporter: Importer<MusicTrack> = {
  ...reimporter,
  parse(file) {
    assertFileSize(file, MAX_BYTES);
    return reimporter.parse(file);
  },
};
