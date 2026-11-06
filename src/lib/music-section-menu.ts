import type { ContextMenuEntry } from "@/components/ContextMenu";
import { findPattern, getSections, patternLabel, patternUses } from "@/lib/music-sections";
import type { MusicTrack } from "@/types";

// The right-click (and long-press) menus of a block and of a channel cell in the Music song row.

export interface SectionMenuActions {
  rename(): void;
  duplicate(): void;
  setRepeat(n: number): void;
  loopFromHere(): void;
  move(delta: -1 | 1): void;
  remove(): void;
}

const REPEAT_COUNTS = [1, 2, 3, 4, 5, 6, 7, 8];

function item(key: string, label: string, onSelect: () => void, extra: Partial<Extract<ContextMenuEntry, { kind: "item" }>> = {}): ContextMenuEntry {
  return { kind: "item", key, label, onSelect, ...extra };
}

function separator(key: string): ContextMenuEntry {
  return { kind: "separator", key };
}

function repeatEntries(current: number, setRepeat: (n: number) => void): ContextMenuEntry[] {
  return REPEAT_COUNTS.map((count) => item(`repeat-${count}`, count === current ? `✓ ×${count}` : `×${count}`, () => setRepeat(count)));
}

export function buildSectionMenu(track: MusicTrack, sectionId: string, actions: SectionMenuActions): ContextMenuEntry[] {
  const sections = getSections(track);
  const index = sections.findIndex((section) => section.id === sectionId);
  const section = sections[index];
  const loopStartId = sections.some((candidate) => candidate.id === track.loopStartId) ? track.loopStartId : sections[0]?.id;
  const isLoopStart = sectionId === loopStartId;
  const entries: ContextMenuEntry[] = [
    item("rename", "Rename", actions.rename),
    item("duplicate", "Duplicate", actions.duplicate),
    { kind: "item", key: "repeat", label: "Repeat", submenu: repeatEntries(section?.repeat ?? 1, actions.setRepeat) },
    item("loop-from-here", "Loop from here", actions.loopFromHere, { disabled: isLoopStart, hint: "The song already loops from here" }),
    separator("separator-move"),
    item("move-left", "Move left", () => actions.move(-1), { disabled: index <= 0, hint: "Already the first section" }),
    item("move-right", "Move right", () => actions.move(1), { disabled: index >= sections.length - 1, hint: "Already the last section" }),
  ];
  if (sections.length <= 1) return entries;
  return [...entries, separator("separator-delete"), item("delete", "Delete", actions.remove, { danger: true })];
}

export interface CellMenuActions {
  usePattern(patternId: string): void;
  newPattern(): void;
  makeSilent(): void;
  unlink(): void;
}

function whereItPlays(track: MusicTrack, patternId: string): string {
  const uses = patternUses(track, patternId);
  return uses.length ? `Plays in ${uses.map((section) => section.name).join(", ")}` : "Not used yet";
}

function patternEntries(track: MusicTrack, channelId: string, currentId: string | undefined, usePattern: (id: string) => void): ContextMenuEntry[] {
  const patterns = track.channels.find((channel) => channel.id === channelId)?.patterns ?? [];
  const labelled = patterns.map((pattern) => ({ pattern, label: patternLabel(track, channelId, pattern.id) }));
  labelled.sort((left, right) => Number(left.label) - Number(right.label));
  return labelled.map(({ pattern, label }) => {
    const isCurrent = pattern.id === currentId;
    return item(`use-pattern-${pattern.id}`, `${isCurrent ? "✓ " : ""}Pattern ${label}`, () => usePattern(pattern.id), {
      disabled: isCurrent,
      detail: whereItPlays(track, pattern.id),
    });
  });
}

export function buildCellMenu(track: MusicTrack, sectionId: string, channelId: string, actions: CellMenuActions): ContextMenuEntry[] {
  const section = getSections(track).find((candidate) => candidate.id === sectionId);
  const current = section && findPattern(track, section, channelId);
  const submenu = patternEntries(track, channelId, current?.id, actions.usePattern);
  const entries: ContextMenuEntry[] = [
    { kind: "item", key: "use-pattern", label: "Use pattern", submenu, disabled: submenu.length === 0, hint: "This channel has no patterns yet" },
    item("new-pattern", "New empty pattern", actions.newPattern),
    item("make-silent", "Make silent", actions.makeSilent, { disabled: !current, hint: "Already silent here" }),
  ];
  if (!current || patternUses(track, current.id).length <= 1) return entries;
  return [...entries, separator("separator-unlink"), item("unlink", "Unlink", actions.unlink, { detail: "Give this section its own copy" })];
}
