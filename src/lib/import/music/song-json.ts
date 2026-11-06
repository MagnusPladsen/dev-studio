import type { MusicSection, MusicTrack } from "@/types";
import { ImportError, jsonReimporter, oneOrMany, type Importer } from "@/lib/import";
import { assertFileSize } from "@/lib/import/file-size";
import { playableSound } from "@/lib/audio/music-instruments";
import { SECTION_LENGTHS } from "@/lib/music-sections";

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

const isSectionShape = (value: unknown): value is MusicSection =>
  isRecord(value) &&
  typeof value.id === "string" &&
  SECTION_LENGTHS.includes(value.length as MusicSection["length"]) &&
  Array.isArray(value.patterns);

/** Keeps the sections whose shape is valid and whose pattern entries point at a real channel pattern; a song left with none is legacy. */
function withValidSections(song: MusicTrack, rawSections: unknown): MusicTrack {
  const rest: MusicTrack = { ...song };
  delete rest.sections;
  delete rest.loopStartId;
  const sections = (Array.isArray(rawSections) ? rawSections : []).filter(isSectionShape).map((section) => ({
    ...section,
    patterns: section.patterns.filter((entry) =>
      isRecord(entry) && song.channels.some((channel) => channel.id === entry.channelId && channel.patterns.some((pattern) => pattern.id === entry.patternId)),
    ),
  }));
  if (sections.length === 0) return rest;
  return sections.some((section) => section.id === song.loopStartId) ? { ...rest, sections, loopStartId: song.loopStartId } : { ...rest, sections };
}

function readSong(value: unknown): MusicTrack {
  if (!isRecord(value) || typeof value.bpm !== "number" || !Array.isArray(value.channels)) {
    throw new ImportError("This isn't a song file. Export one from the Music composer with Export → Song JSON.");
  }
  if (!value.channels.every(isChannel)) throw new ImportError("This song file is damaged: some channels or notes are incomplete.");
  const song: MusicTrack = {
    ...(value as unknown as MusicTrack),
    channels: (value.channels as MusicTrack["channels"]).map(playableSound),
    id: typeof value.id === "string" ? value.id : "song",
    name: typeof value.name === "string" && value.name.trim() ? value.name : "Imported song",
    tags: Array.isArray(value.tags) ? value.tags.filter((tag): tag is string => typeof tag === "string") : [],
  };
  return withValidSections(song, value.sections);
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
