import { v4 as uuid } from "uuid";
import type { MusicChannel, MusicNote, MusicPattern, MusicSection, MusicSectionLength, MusicTrack } from "@/types";

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

/** Legacy songs become one explicit section; sectioned songs are returned as they are. */
export function materialise(track: MusicTrack): MusicTrack {
  return isLegacy(track) ? { ...track, sections: [getSections(track)[0]] } : track;
}

export function nextSectionName(sections: MusicSection[]): string {
  const usedNames = new Set(sections.map((section) => section.name));
  for (let code = 65; code <= 90; code++) {
    const letter = String.fromCharCode(code);
    if (!usedNames.has(letter)) return letter;
  }
  return `Section ${sections.length + 1}`;
}

function mapSections(track: MusicTrack, change: (sections: MusicSection[]) => MusicSection[]): MusicTrack {
  const materialised = materialise(track);
  return { ...materialised, sections: change(materialised.sections ?? []) };
}

function mapSection(track: MusicTrack, id: string, change: (section: MusicSection) => MusicSection): MusicTrack {
  return mapSections(track, (sections) => sections.map((section) => (section.id === id ? change(section) : section)));
}

function mapChannel(track: MusicTrack, channelId: string, change: (channel: MusicChannel) => MusicChannel): MusicTrack {
  return { ...track, channels: track.channels.map((channel) => (channel.id === channelId ? change(channel) : channel)) };
}

function withEntry(section: MusicSection, channelId: string, patternId: string | null): MusicSection {
  const others = section.patterns.filter((entry) => entry.channelId !== channelId);
  return { ...section, patterns: patternId ? [...others, { channelId, patternId }] : others };
}

function copyPattern(pattern: MusicPattern): MusicPattern {
  return { id: uuid(), notes: pattern.notes.map((note) => ({ ...note })) };
}

export function addSection(track: MusicTrack, afterId: string, mode: "copy" | "empty"): { track: MusicTrack; sectionId: string } {
  const materialised = materialise(track);
  const sections = materialised.sections ?? [];
  const source = sections.find((section) => section.id === afterId) ?? sections[sections.length - 1];
  const created: MusicSection = { id: uuid(), name: nextSectionName(sections), length: source.length, patterns: [] };
  let channels = materialised.channels;
  if (mode === "copy") {
    const copies = source.patterns.flatMap((entry) => {
      const pattern = findPattern(materialised, source, entry.channelId);
      return pattern ? [{ channelId: entry.channelId, pattern: copyPattern(pattern) }] : [];
    });
    created.patterns = copies.map((copy) => ({ channelId: copy.channelId, patternId: copy.pattern.id }));
    channels = channels.map((channel) => {
      const copy = copies.find((candidate) => candidate.channelId === channel.id);
      return copy ? { ...channel, patterns: [...channel.patterns, copy.pattern] } : channel;
    });
  }
  const index = sections.indexOf(source) + 1;
  const nextSections = [...sections.slice(0, index), created, ...sections.slice(index)];
  return { track: { ...materialised, channels, sections: nextSections }, sectionId: created.id };
}

function dropUnusedPatterns(track: MusicTrack): MusicTrack {
  const sections = track.sections ?? [];
  return {
    ...track,
    channels: track.channels.map((channel) => ({
      ...channel,
      patterns: channel.patterns.filter((pattern) =>
        sections.some((section) => section.patterns.some((entry) => entry.channelId === channel.id && entry.patternId === pattern.id)),
      ),
    })),
  };
}

export function deleteSection(track: MusicTrack, id: string): MusicTrack {
  const materialised = materialise(track);
  const sections = materialised.sections ?? [];
  const index = sections.findIndex((section) => section.id === id);
  if (sections.length <= 1 || index === -1) return track;
  const remaining = sections.filter((section) => section.id !== id);
  const loopStartId = materialised.loopStartId === id ? remaining[Math.min(index, remaining.length - 1)].id : materialised.loopStartId;
  return dropUnusedPatterns({ ...materialised, sections: remaining, loopStartId });
}

export function moveSection(track: MusicTrack, id: string, delta: -1 | 1): MusicTrack {
  return mapSections(track, (sections) => {
    const index = sections.findIndex((section) => section.id === id);
    const target = index + delta;
    if (index === -1 || target < 0 || target >= sections.length) return sections;
    const moved = [...sections];
    [moved[index], moved[target]] = [moved[target], moved[index]];
    return moved;
  });
}

export function updateSection(track: MusicTrack, id: string, patch: Partial<Pick<MusicSection, "name" | "length" | "repeat">>): MusicTrack {
  return mapSection(track, id, (section) => ({ ...section, ...patch }));
}

export function setLoopStart(track: MusicTrack, id: string): MusicTrack {
  return { ...materialise(track), loopStartId: id };
}

function setLegacyNotes(track: MusicTrack, channelId: string, update: (notes: MusicNote[]) => MusicNote[]): MusicTrack {
  return mapChannel(track, channelId, (channel) => {
    const first = channel.patterns[0] ?? { id: uuid(), notes: [] };
    return { ...channel, patterns: [{ ...first, notes: update(first.notes) }, ...channel.patterns.slice(1)] };
  });
}

export function setSectionNotes(track: MusicTrack, sectionId: string, channelId: string, update: (notes: MusicNote[]) => MusicNote[]): MusicTrack {
  if (isLegacy(track)) return setLegacyNotes(track, channelId, update);
  const section = getSections(track).find((candidate) => candidate.id === sectionId);
  if (!section) return track;
  const existing = findPattern(track, section, channelId);
  if (existing) {
    return mapChannel(track, channelId, (channel) => ({
      ...channel,
      patterns: channel.patterns.map((pattern) => (pattern.id === existing.id ? { ...pattern, notes: update(pattern.notes) } : pattern)),
    }));
  }
  const created: MusicPattern = { id: uuid(), notes: update([]) };
  const withPattern = mapChannel(track, channelId, (channel) => ({ ...channel, patterns: [...channel.patterns, created] }));
  return mapSection(withPattern, sectionId, (target) => withEntry(target, channelId, created.id));
}

export function assignPattern(track: MusicTrack, sectionId: string, channelId: string, patternId: string | "new" | null): MusicTrack {
  const materialised = materialise(track);
  if (patternId !== "new") return mapSection(materialised, sectionId, (section) => withEntry(section, channelId, patternId));
  const created: MusicPattern = { id: uuid(), notes: [] };
  const withPattern = mapChannel(materialised, channelId, (channel) => ({ ...channel, patterns: [...channel.patterns, created] }));
  return mapSection(withPattern, sectionId, (section) => withEntry(section, channelId, created.id));
}

export function unlinkPattern(track: MusicTrack, sectionId: string, channelId: string): MusicTrack {
  const materialised = materialise(track);
  const section = materialised.sections?.find((candidate) => candidate.id === sectionId);
  const pattern = section && findPattern(materialised, section, channelId);
  if (!pattern) return materialised;
  const copy = copyPattern(pattern);
  const withCopy = mapChannel(materialised, channelId, (channel) => ({ ...channel, patterns: [...channel.patterns, copy] }));
  return mapSection(withCopy, sectionId, (target) => withEntry(target, channelId, copy.id));
}

/** Sections that play the pattern, in song order. */
export function patternUses(track: MusicTrack, patternId: string): MusicSection[] {
  return getSections(track).filter((section) => section.patterns.some((entry) => entry.patternId === patternId));
}

/** "1", "2"… by first use in song order; a pattern no section plays comes after the used ones. */
export function patternLabel(track: MusicTrack, channelId: string, patternId: string): string {
  const order: string[] = [];
  for (const section of getSections(track)) {
    const entry = section.patterns.find((candidate) => candidate.channelId === channelId);
    if (entry && !order.includes(entry.patternId)) order.push(entry.patternId);
  }
  const channel = track.channels.find((candidate) => candidate.id === channelId);
  for (const pattern of channel?.patterns ?? []) if (!order.includes(pattern.id)) order.push(pattern.id);
  return String(order.indexOf(patternId) + 1);
}
