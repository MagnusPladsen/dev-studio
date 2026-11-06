import type { MusicNote, MusicPattern, MusicSection, MusicSectionLength, MusicTrack } from "@/types";

export const SECTION_LENGTHS: MusicSectionLength[] = [8, 16, 32];
export const LEGACY_SECTION_ID = "section-a";

export interface SongStep {
  sectionId: string;
  length: number;
}

/** Shortest loop length that shows every note in the track. */
export function fitPatternLength(track: MusicTrack): MusicSectionLength {
  const end = Math.max(0, ...track.channels.flatMap((c) => c.patterns[0]?.notes.map((n) => n.start + n.duration) ?? []));
  return SECTION_LENGTHS.find((l) => l >= end - 1e-6) ?? 32;
}

export function isLegacy(track: MusicTrack): boolean {
  return !track.sections?.length;
}

/** The track's sections; an old song reads as one section A over each channel's first pattern. */
export function getSections(track: MusicTrack): MusicSection[] {
  if (track.sections?.length) return track.sections;
  return [
    {
      id: LEGACY_SECTION_ID,
      name: "A",
      length: fitPatternLength(track),
      patterns: track.channels.flatMap((channel) => (channel.patterns[0] ? [{ channelId: channel.id, patternId: channel.patterns[0].id }] : [])),
    },
  ];
}

export function findPattern(track: MusicTrack, section: MusicSection, channelId: string): MusicPattern | undefined {
  const entry = section.patterns.find((pattern) => pattern.channelId === channelId);
  if (!entry) return undefined;
  return track.channels.find((channel) => channel.id === channelId)?.patterns.find((pattern) => pattern.id === entry.patternId);
}

export function sectionNotes(track: MusicTrack, section: MusicSection, channelId: string): MusicNote[] {
  return findPattern(track, section, channelId)?.notes.filter((note) => note.start < section.length) ?? [];
}

export function resolveSelectedSection(track: MusicTrack, id: string | null): MusicSection {
  const sections = getSections(track);
  return sections.find((section) => section.id === id) ?? sections[0];
}

export function songSteps(track: MusicTrack, mode: "song" | "section", sectionId: string): { steps: SongStep[]; loopIndex: number } {
  const sections = getSections(track);
  if (mode === "section") {
    const section = sections.find((candidate) => candidate.id === sectionId) ?? sections[0];
    return { steps: [{ sectionId: section.id, length: section.length }], loopIndex: 0 };
  }
  const steps: SongStep[] = [];
  let loopIndex = 0;
  for (const section of sections) {
    if (section.id === track.loopStartId) loopIndex = steps.length;
    for (let played = 0; played < (section.repeat ?? 1); played++) steps.push({ sectionId: section.id, length: section.length });
  }
  return { steps, loopIndex };
}
