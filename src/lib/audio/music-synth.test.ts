import { describe, expect, it } from "vitest";
import type { MusicTrack } from "@/types";
import { LEGACY_SECTION_ID, addSection, setSectionNotes, updateSection } from "@/lib/music-sections";
import { trackLengthSeconds } from "./music-synth";

describe("trackLengthSeconds", () => {
  it("ends with the last note of any channel", () => {
    const track = {
      bpm: 120,
      channels: [{ patterns: [{ notes: [{ start: 0, duration: 4 }, { start: 6, duration: 2 }] }] }],
    } as MusicTrack;
    expect(trackLengthSeconds(track)).toBe(4);
  });

  it("adds up every step of a song with several sections", () => {
    const base = { bpm: 120, channels: [{ id: "c", name: "c", instrument: "square", volume: 0.5, patterns: [] }] } as unknown as MusicTrack;
    const withSections = addSection(updateSection(setSectionNotes(base, LEGACY_SECTION_ID, "c", () => []), LEGACY_SECTION_ID, { length: 8 }), LEGACY_SECTION_ID, "empty");
    const sized = updateSection(withSections.track, withSections.sectionId, { length: 16 });
    expect(trackLengthSeconds(sized)).toBe(12);
  });

  it("is zero without channels", () => {
    expect(trackLengthSeconds({ bpm: 120, channels: [] } as unknown as MusicTrack)).toBe(0);
  });
});
