import { describe, expect, it, vi } from "vitest";
import type { ContextMenuEntry } from "@/components/ContextMenu";
import type { MusicChannel, MusicPattern, MusicSection, MusicTrack } from "@/types";
import { buildCellMenu, buildSectionMenu, type CellMenuActions, type SectionMenuActions } from "./music-section-menu";

function section(id: string, repeat?: number): MusicSection {
  return { id, name: id.toUpperCase(), length: 8, repeat, patterns: [] };
}

function track(sections: MusicSection[], loopStartId?: string): MusicTrack {
  return { id: "t", projectId: "p", name: "T", bpm: 120, channels: [], tags: [], createdAt: "", updatedAt: "", sections, loopStartId };
}

function makeActions(): SectionMenuActions {
  return { rename: vi.fn(), duplicate: vi.fn(), setRepeat: vi.fn(), loopFromHere: vi.fn(), move: vi.fn(), remove: vi.fn() };
}

type Item = Extract<ContextMenuEntry, { kind: "item" }>;
const labels = (entries: ContextMenuEntry[]): string[] => entries.map((entry) => (entry.kind === "separator" ? "—" : entry.label));
const find = (entries: ContextMenuEntry[], key: string): Item | undefined =>
  entries.find((entry): entry is Item => entry.kind === "item" && entry.key === key);

const song = track([section("a"), section("b", 3), section("c")]);

describe("buildSectionMenu", () => {
  it("lists the entries in order for a middle section", () => {
    expect(labels(buildSectionMenu(song, "b", makeActions()))).toEqual([
      "Rename", "Duplicate", "Repeat", "Loop from here", "—", "Move left", "Move right", "—", "Delete",
    ]);
  });

  it("offers repeat ×1 to ×8 with the current one marked", () => {
    const repeat = find(buildSectionMenu(song, "b", makeActions()), "repeat");
    expect(repeat?.submenu && labels(repeat.submenu)).toEqual(["×1", "×2", "✓ ×3", "×4", "×5", "×6", "×7", "×8"]);
  });

  it("marks ×1 when the section has no repeat set", () => {
    const repeat = find(buildSectionMenu(song, "a", makeActions()), "repeat");
    expect(repeat?.submenu?.[0].kind === "item" && repeat.submenu[0].label).toBe("✓ ×1");
  });

  it("calls setRepeat with the picked count", () => {
    const actions = makeActions();
    const repeat = find(buildSectionMenu(song, "a", actions), "repeat");
    const four = repeat?.submenu && find(repeat.submenu, "repeat-4");
    four?.onSelect?.();
    expect(actions.setRepeat).toHaveBeenCalledWith(4);
  });

  it("disables Loop from here on the first section when no loop start is stored", () => {
    expect(find(buildSectionMenu(song, "a", makeActions()), "loop-from-here")?.disabled).toBe(true);
    expect(find(buildSectionMenu(song, "b", makeActions()), "loop-from-here")?.disabled).toBeFalsy();
  });

  it("disables Loop from here on the stored loop start", () => {
    const looped = track(song.sections ?? [], "c");
    expect(find(buildSectionMenu(looped, "c", makeActions()), "loop-from-here")?.disabled).toBe(true);
    expect(find(buildSectionMenu(looped, "a", makeActions()), "loop-from-here")?.disabled).toBeFalsy();
  });

  it("disables Move left on the first section and Move right on the last", () => {
    const first = buildSectionMenu(song, "a", makeActions());
    const last = buildSectionMenu(song, "c", makeActions());
    expect(find(first, "move-left")?.disabled).toBe(true);
    expect(find(first, "move-right")?.disabled).toBeFalsy();
    expect(find(last, "move-left")?.disabled).toBeFalsy();
    expect(find(last, "move-right")?.disabled).toBe(true);
  });

  it("moves by -1 and +1", () => {
    const actions = makeActions();
    const entries = buildSectionMenu(song, "b", actions);
    find(entries, "move-left")?.onSelect?.();
    find(entries, "move-right")?.onSelect?.();
    expect(actions.move).toHaveBeenNthCalledWith(1, -1);
    expect(actions.move).toHaveBeenNthCalledWith(2, 1);
  });

  it("marks Delete as dangerous and calls remove", () => {
    const actions = makeActions();
    const remove = find(buildSectionMenu(song, "b", actions), "delete");
    expect(remove?.danger).toBe(true);
    remove?.onSelect?.();
    expect(actions.remove).toHaveBeenCalled();
  });

  it("leaves out Delete and its separator when it is the only section", () => {
    expect(labels(buildSectionMenu(track([section("a")]), "a", makeActions()))).toEqual([
      "Rename", "Duplicate", "Repeat", "Loop from here", "—", "Move left", "Move right",
    ]);
  });

  it("wires Rename, Duplicate and Loop from here", () => {
    const actions = makeActions();
    const entries = buildSectionMenu(song, "b", actions);
    find(entries, "rename")?.onSelect?.();
    find(entries, "duplicate")?.onSelect?.();
    find(entries, "loop-from-here")?.onSelect?.();
    expect(actions.rename).toHaveBeenCalled();
    expect(actions.duplicate).toHaveBeenCalled();
    expect(actions.loopFromHere).toHaveBeenCalled();
  });
});

describe("buildCellMenu", () => {
  const pattern = (id: string): MusicPattern => ({ id, notes: [] });
  const channel = (id: string, patterns: MusicPattern[]): MusicChannel => ({ id, name: id, instrument: "square", volume: 1, patterns });
  const entry = (channelId: string, patternId: string) => ({ channelId, patternId });
  const linkedSong: MusicTrack = {
    ...track([
      { id: "a", name: "A", length: 8, patterns: [entry("lead", "p1"), entry("bass", "b1")] },
      { id: "b", name: "B", length: 8, patterns: [entry("lead", "p2")] },
      { id: "chorus", name: "Chorus", length: 8, patterns: [entry("lead", "p1")] },
    ]),
    channels: [channel("lead", [pattern("p2"), pattern("p1"), pattern("spare")]), channel("bass", [pattern("b1")])],
  };
  const makeCellActions = (): CellMenuActions => ({ usePattern: vi.fn(), newPattern: vi.fn(), makeSilent: vi.fn(), unlink: vi.fn() });

  it("lists the entries in order for a linked cell", () => {
    expect(labels(buildCellMenu(linkedSong, "a", "lead", makeCellActions()))).toEqual([
      "Use pattern", "New empty pattern", "Make silent", "—", "Unlink",
    ]);
  });

  it("leaves out Unlink when the pattern plays only here", () => {
    expect(labels(buildCellMenu(linkedSong, "b", "lead", makeCellActions()))).toEqual(["Use pattern", "New empty pattern", "Make silent"]);
  });

  it("lists this channel's patterns by label with where each plays, the current one disabled", () => {
    const use = find(buildCellMenu(linkedSong, "a", "lead", makeCellActions()), "use-pattern");
    const patterns = (use?.submenu ?? []).filter((candidate): candidate is Item => candidate.kind === "item");
    expect(patterns.map((candidate) => [candidate.label, candidate.detail, Boolean(candidate.disabled)])).toEqual([
      ["✓ Pattern 1", "Plays in A, Chorus", true],
      ["Pattern 2", "Plays in B", false],
      ["Pattern 3", "Not used yet", false],
    ]);
  });

  it("calls usePattern with the picked pattern's id", () => {
    const actions = makeCellActions();
    const use = find(buildCellMenu(linkedSong, "b", "lead", actions), "use-pattern");
    find(use?.submenu ?? [], "use-pattern-p1")?.onSelect?.();
    expect(actions.usePattern).toHaveBeenCalledWith("p1");
  });

  it("disables Make silent when the channel is already silent here", () => {
    expect(find(buildCellMenu(linkedSong, "b", "bass", makeCellActions()), "make-silent")?.disabled).toBe(true);
    expect(find(buildCellMenu(linkedSong, "a", "bass", makeCellActions()), "make-silent")?.disabled).toBeFalsy();
  });

  it("wires New empty pattern, Make silent and Unlink", () => {
    const actions = makeCellActions();
    const entries = buildCellMenu(linkedSong, "a", "lead", actions);
    find(entries, "new-pattern")?.onSelect?.();
    find(entries, "make-silent")?.onSelect?.();
    find(entries, "unlink")?.onSelect?.();
    expect(actions.newPattern).toHaveBeenCalled();
    expect(actions.makeSilent).toHaveBeenCalled();
    expect(actions.unlink).toHaveBeenCalled();
  });
});
