import { describe, expect, it } from "vitest";
import type { MusicChannel, MusicSection, MusicTrack } from "@/types";
import {
  addSection,
  assignPattern,
  deleteSection,
  getSections,
  materialise,
  moveSection,
  nextSectionName,
  patternLabel,
  patternUses,
  resolveSelectedSection,
  sectionNotes,
  setLoopStart,
  setSectionNotes,
  songSteps,
  unlinkPattern,
  updateSection,
  withLegacyLength,
} from "./music-sections";

function channel(id: string, patterns: MusicChannel["patterns"]): MusicChannel {
  return { id, name: id, instrument: "square", volume: 1, patterns };
}

function section(id: string, length: 8 | 16 | 32, repeat?: number): MusicSection {
  return { id, name: id, length, repeat, patterns: [] };
}

function track(channels: MusicChannel[], extra: Partial<MusicTrack> = {}): MusicTrack {
  return { id: "t", projectId: "p", name: "T", bpm: 120, channels, tags: [], createdAt: "", updatedAt: "", ...extra };
}

const note = (start: number) => ({ pitch: 60, start, duration: 1, velocity: 1 });

describe("getSections", () => {
  it("reads a legacy track as one section A over each channel's first pattern", () => {
    const legacy = track([channel("c1", [{ id: "p1", notes: [note(11)] }]), channel("c2", [{ id: "p2", notes: [] }])]);
    expect(getSections(legacy)).toEqual([
      {
        id: "section-a",
        name: "A",
        length: 16,
        patterns: [
          { channelId: "c1", patternId: "p1" },
          { channelId: "c2", patternId: "p2" },
        ],
      },
    ]);
  });

  it("leaves out a legacy channel with no patterns", () => {
    const legacy = track([channel("c1", [{ id: "p1", notes: [] }]), channel("c2", [])]);
    expect(getSections(legacy)[0].patterns).toEqual([{ channelId: "c1", patternId: "p1" }]);
  });

  it("returns stored sections unchanged", () => {
    const sections = [section("a", 8)];
    expect(getSections(track([], { sections }))).toBe(sections);
  });
});

describe("withLegacyLength", () => {
  const legacy = track([channel("c1", [{ id: "p1", notes: [note(2), note(12)] }])]);

  it("should keep a legacy track's length when notes past beat 8 are erased", () => {
    const erased = setSectionNotes(legacy, "section-a", "c1", (notes) => notes.filter((candidate) => candidate.start < 8));
    expect(getSections(withLegacyLength(erased, 16))[0].length).toBe(16);
  });

  it("should leave the stored track legacy", () => {
    withLegacyLength(legacy, 16);
    expect(legacy.sections).toBeUndefined();
  });

  it("should grow past the pinned length when notes reach further", () => {
    expect(getSections(withLegacyLength(legacy, 8))[0].length).toBe(16);
  });

  it("should leave a sectioned track as it is", () => {
    const sectioned = track([], { sections: [section("a", 8)] });
    expect(withLegacyLength(sectioned, 32)).toBe(sectioned);
  });
});

describe("sectionNotes", () => {
  const withPattern = track([channel("c1", [{ id: "p1", notes: [note(2), note(9)] }])]);
  const eightBeats: MusicSection = { id: "a", name: "A", length: 8, patterns: [{ channelId: "c1", patternId: "p1" }] };

  it("drops notes that start at or after the section length", () => {
    expect(sectionNotes(withPattern, eightBeats, "c1").map((n) => n.start)).toEqual([2]);
  });

  it("is silent for an unknown pattern or channel", () => {
    const unknownPattern = { ...eightBeats, patterns: [{ channelId: "c1", patternId: "gone" }] };
    expect(sectionNotes(withPattern, unknownPattern, "c1")).toEqual([]);
    expect(sectionNotes(withPattern, eightBeats, "gone")).toEqual([]);
  });
});

describe("resolveSelectedSection", () => {
  const sections = [section("a", 8), section("b", 8)];
  const song = track([], { sections });

  it("falls back to the first section", () => {
    expect(resolveSelectedSection(song, "gone")).toBe(sections[0]);
    expect(resolveSelectedSection(song, null)).toBe(sections[0]);
  });

  it("finds a section by id", () => {
    expect(resolveSelectedSection(song, "b")).toBe(sections[1]);
  });
});

describe("songSteps", () => {
  const sections = [section("intro", 8), section("a", 16, 2), section("b", 8)];

  it("repeats sections and finds the loop start", () => {
    const result = songSteps(track([], { sections, loopStartId: "a" }), "song", "intro");
    expect(result.steps).toEqual([
      { sectionId: "intro", length: 8 },
      { sectionId: "a", length: 16 },
      { sectionId: "a", length: 16 },
      { sectionId: "b", length: 8 },
    ]);
    expect(result.loopIndex).toBe(1);
  });

  it("loops from the start when there is no valid loop start", () => {
    expect(songSteps(track([], { sections }), "song", "intro").loopIndex).toBe(0);
    expect(songSteps(track([], { sections, loopStartId: "nope" }), "song", "intro").loopIndex).toBe(0);
  });

  it("plays just the chosen section once in section mode", () => {
    expect(songSteps(track([], { sections }), "section", "b")).toEqual({ steps: [{ sectionId: "b", length: 8 }], loopIndex: 0 });
  });
});

describe("section edit helpers", () => {
  const legacy = () => track([channel("c1", [{ id: "p1", notes: [note(2), note(11)] }]), channel("c2", [{ id: "p2", notes: [note(0)] }])]);

  function sectioned(): MusicTrack {
    return track(
      [channel("c1", [{ id: "p1", notes: [note(1)] }, { id: "p2", notes: [note(3)] }]), channel("c2", [{ id: "p3", notes: [note(5)] }])],
      {
        sections: [
          { id: "A", name: "A", length: 16, patterns: [{ channelId: "c1", patternId: "p1" }, { channelId: "c2", patternId: "p3" }] },
          { id: "B", name: "B", length: 16, patterns: [{ channelId: "c1", patternId: "p2" }] },
          { id: "C", name: "C", length: 16, patterns: [{ channelId: "c1", patternId: "p1" }] },
        ],
      },
    );
  }

  describe("materialise", () => {
    it("turns a legacy track into one explicit section", () => {
      const result = materialise(legacy());
      expect(result.sections).toHaveLength(1);
      expect(result.sections?.[0].id).toBe("section-a");
      expect(sectionNotes(result, result.sections![0], "c1")).toEqual(sectionNotes(legacy(), getSections(legacy())[0], "c1"));
    });

    it("returns a sectioned track as the same reference", () => {
      const t = sectioned();
      expect(materialise(t)).toBe(t);
    });
  });

  it("materialises a legacy track before editing", () => {
    expect(updateSection(legacy(), "section-a", { name: "Verse" }).sections?.[0].name).toBe("Verse");
    expect(setLoopStart(legacy(), "section-a").sections).toHaveLength(1);
    expect(addSection(legacy(), "section-a", "empty").track.sections).toHaveLength(2);
  });

  describe("nextSectionName", () => {
    it("picks the first unused letter", () => {
      expect(nextSectionName(["A", "B", "Intro"].map((name) => ({ ...section(name, 8), name })))).toBe("C");
      expect(nextSectionName(["A", "C"].map((name) => ({ ...section(name, 8), name })))).toBe("B");
    });

    it("falls back to numbered names after Z", () => {
      const letters = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i)).map((name) => ({ ...section(name, 8), name }));
      expect(nextSectionName(letters)).toBe("Section 27");
    });
  });

  describe("addSection", () => {
    it("copies every channel into new unlinked patterns after the chosen section", () => {
      const t = sectioned();
      const { track: result, sectionId } = addSection(t, "A", "copy");
      expect(result.sections?.map((s) => s.id).indexOf(sectionId)).toBe(1);
      const created = result.sections![1];
      expect(created.name).toBe("D");
      expect(created.length).toBe(16);
      const original = result.sections![0];
      for (const entry of original.patterns) {
        const copy = created.patterns.find((p) => p.channelId === entry.channelId)!;
        expect(copy.patternId).not.toBe(entry.patternId);
        expect(sectionNotes(result, created, entry.channelId)).toEqual(sectionNotes(result, original, entry.channelId));
      }
      expect(t.sections).toHaveLength(3);
    });

    it("keeps a silent channel silent in the copy", () => {
      const { track: result } = addSection(sectioned(), "B", "copy");
      expect(result.sections![2].patterns.map((p) => p.channelId)).toEqual(["c1"]);
    });

    it("adds an empty section of the same length", () => {
      const { track: result, sectionId } = addSection(sectioned(), "A", "empty");
      const created = result.sections!.find((s) => s.id === sectionId)!;
      expect(created.patterns).toEqual([]);
      expect(created.length).toBe(16);
    });
  });

  describe("deleteSection", () => {
    it("does nothing to the only section", () => {
      const only = track([], { sections: [section("a", 8)] });
      expect(deleteSection(only, "a")).toBe(only);
    });

    it("drops patterns no remaining section uses and keeps shared ones", () => {
      const result = deleteSection(sectioned(), "B");
      const ids = result.channels[0].patterns.map((p) => p.id);
      expect(ids).toEqual(["p1"]);
      expect(result.channels[1].patterns.map((p) => p.id)).toEqual(["p3"]);
    });

    it("moves the loop start to the section now at that index", () => {
      const t = { ...sectioned(), loopStartId: "B" };
      expect(deleteSection(t, "B").loopStartId).toBe("C");
      expect(deleteSection({ ...t, loopStartId: "C" }, "C").loopStartId).toBe("B");
      expect(deleteSection({ ...t, loopStartId: "A" }, "B").loopStartId).toBe("A");
    });
  });

  describe("moveSection", () => {
    it("swaps with the neighbour", () => {
      expect(moveSection(sectioned(), "B", -1).sections?.map((s) => s.id)).toEqual(["B", "A", "C"]);
      expect(moveSection(sectioned(), "B", 1).sections?.map((s) => s.id)).toEqual(["A", "C", "B"]);
    });

    it("does nothing at the ends", () => {
      expect(moveSection(sectioned(), "A", -1).sections?.map((s) => s.id)).toEqual(["A", "B", "C"]);
      expect(moveSection(sectioned(), "C", 1).sections?.map((s) => s.id)).toEqual(["A", "B", "C"]);
    });
  });

  describe("updateSection", () => {
    it("keeps notes past the new length in the pattern", () => {
      const shortened = updateSection(legacy(), "section-a", { length: 8 });
      const target = shortened.sections![0];
      expect(sectionNotes(shortened, target, "c1").map((n) => n.start)).toEqual([2]);
      const restored = updateSection(shortened, "section-a", { length: 16 });
      expect(sectionNotes(restored, restored.sections![0], "c1").map((n) => n.start)).toEqual([2, 11]);
    });

    it("sets repeat", () => {
      expect(updateSection(sectioned(), "A", { repeat: 3 }).sections![0].repeat).toBe(3);
    });
  });

  it("sets the loop start", () => {
    expect(setLoopStart(sectioned(), "C").loopStartId).toBe("C");
  });

  describe("setSectionNotes", () => {
    it("writes a legacy track's first pattern and leaves sections undefined", () => {
      const result = setSectionNotes(legacy(), "section-a", "c1", () => [note(7)]);
      expect(result.sections).toBeUndefined();
      expect(result.channels[0].patterns[0].notes).toEqual([note(7)]);
    });

    it("creates a first pattern for a legacy channel that has none", () => {
      const bare = track([channel("c1", [])]);
      const result = setSectionNotes(bare, "section-a", "c1", () => [note(4)]);
      expect(result.sections).toBeUndefined();
      expect(result.channels[0].patterns[0].notes).toEqual([note(4)]);
    });

    it("creates a pattern for a silent channel in that section only", () => {
      const t = sectioned();
      const result = setSectionNotes(t, "B", "c2", () => [note(6)]);
      expect(result.channels[1].patterns).toHaveLength(2);
      const entry = result.sections![1].patterns.find((p) => p.channelId === "c2");
      expect(entry).toBeDefined();
      expect(sectionNotes(result, result.sections![1], "c2")).toEqual([note(6)]);
      expect(result.sections![0].patterns).toEqual(t.sections![0].patterns);
    });

    it("changes every section that shares the pattern", () => {
      const result = setSectionNotes(sectioned(), "A", "c1", () => [note(9)]);
      expect(sectionNotes(result, result.sections![2], "c1")).toEqual([note(9)]);
      expect(sectionNotes(result, result.sections![1], "c1")).toEqual([note(3)]);
    });
  });

  describe("assignPattern", () => {
    it("gives an empty new pattern", () => {
      const result = assignPattern(sectioned(), "B", "c2", "new");
      expect(sectionNotes(result, result.sections![1], "c2")).toEqual([]);
      expect(result.sections![1].patterns.some((p) => p.channelId === "c2")).toBe(true);
      expect(result.channels[1].patterns).toHaveLength(2);
    });

    it("removes the entry for null", () => {
      const result = assignPattern(sectioned(), "A", "c2", null);
      expect(result.sections![0].patterns.map((p) => p.channelId)).toEqual(["c1"]);
    });

    it("links an existing pattern", () => {
      const result = assignPattern(sectioned(), "B", "c1", "p1");
      expect(sectionNotes(result, result.sections![1], "c1")).toEqual([note(1)]);
    });
  });

  describe("unlinkPattern", () => {
    it("gives this section its own copy and leaves the others on the original", () => {
      const result = unlinkPattern(sectioned(), "C", "c1");
      const copyId = result.sections![2].patterns[0].patternId;
      expect(copyId).not.toBe("p1");
      expect(sectionNotes(result, result.sections![2], "c1")).toEqual([note(1)]);
      expect(result.sections![0].patterns[0].patternId).toBe("p1");
    });
  });

  describe("patternUses and patternLabel", () => {
    it("lists the sections using a pattern in song order", () => {
      expect(patternUses(sectioned(), "p1").map((s) => s.id)).toEqual(["A", "C"]);
    });

    it("numbers patterns by first use in song order", () => {
      const t = sectioned();
      expect(patternLabel(t, "c1", "p1")).toBe("1");
      expect(patternLabel(t, "c1", "p2")).toBe("2");
      expect(patternLabel(moveSection(t, "B", -1), "c1", "p2")).toBe("1");
    });
  });
});
