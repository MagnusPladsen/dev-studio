import { describe, expect, it } from "vitest";
import type { MusicChannel, MusicSection, MusicTrack } from "@/types";
import { getSections, resolveSelectedSection, sectionNotes, songSteps } from "./music-sections";

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
