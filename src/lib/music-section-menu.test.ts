import { describe, expect, it, vi } from "vitest";
import type { ContextMenuEntry } from "@/components/ContextMenu";
import type { MusicSection, MusicTrack } from "@/types";
import { buildSectionMenu, type SectionMenuActions } from "./music-section-menu";

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
