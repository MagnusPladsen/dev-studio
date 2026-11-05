import { describe, expect, it } from "vitest";
import { isInScale, isScaleLocked, SCALES, songScale, type SongScale } from "./music-scale";

/** The MIDI notes from C4 (60) to B4 (71) that are in the scale. */
function octaveFrom60(scale: SongScale): number[] {
  return Array.from({ length: 12 }, (_, i) => 60 + i).filter((midi) => isInScale(midi, scale));
}

describe("isInScale", () => {
  it("C major is the white keys", () => {
    expect(octaveFrom60({ key: 0, scale: "major" })).toEqual([60, 62, 64, 65, 67, 69, 71]);
  });

  it("A natural minor has the same notes as C major", () => {
    expect(octaveFrom60({ key: 9, scale: "minor" })).toEqual(octaveFrom60({ key: 0, scale: "major" }));
  });

  it("G major has F# instead of F", () => {
    const notes = octaveFrom60({ key: 7, scale: "major" });
    expect(notes).toContain(66);
    expect(notes).not.toContain(65);
  });

  it("pentatonics and blues", () => {
    expect(octaveFrom60({ key: 0, scale: "majorPentatonic" })).toEqual([60, 62, 64, 67, 69]);
    expect(octaveFrom60({ key: 9, scale: "minorPentatonic" })).toEqual([60, 62, 64, 67, 69]);
    expect(octaveFrom60({ key: 0, scale: "blues" })).toEqual([60, 63, 65, 66, 67, 70]);
  });

  it("is the same in every octave, including below the key note", () => {
    const eMinor: SongScale = { key: 4, scale: "minor" };
    for (const midi of [42, 54, 66, 78]) expect(isInScale(midi, eMinor)).toBe(true); // F#
    for (const midi of [41, 53, 65, 77]) expect(isInScale(midi, eMinor)).toBe(false); // F
  });

  it("chromatic allows every note", () => {
    expect(octaveFrom60({ key: 5, scale: "chromatic" })).toHaveLength(12);
  });

  it("every scale starts on its key note", () => {
    for (const scale of Object.keys(SCALES) as SongScale["scale"][]) {
      for (let key = 0; key < 12; key++) expect(isInScale(48 + key, { key, scale })).toBe(true);
    }
  });
});

describe("songScale", () => {
  it("songs without key or scale are chromatic, so the lock is off", () => {
    const scale = songScale({});
    expect(scale).toEqual({ key: 0, scale: "chromatic" });
    expect(isScaleLocked(scale)).toBe(false);
  });

  it("keeps a saved key and scale", () => {
    const scale = songScale({ key: 9, scale: "minor" });
    expect(scale).toEqual({ key: 9, scale: "minor" });
    expect(isScaleLocked(scale)).toBe(true);
  });

  it("falls back on unknown scales and wraps keys into 0–11", () => {
    expect(songScale({ key: 14, scale: "dorian" as SongScale["scale"] })).toEqual({ key: 2, scale: "chromatic" });
    expect(songScale({ key: -1, scale: "major" })).toEqual({ key: 11, scale: "major" });
  });
});
