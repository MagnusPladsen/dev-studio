import { describe, expect, it } from "vitest";
import type { MusicTrack } from "@/types";
import { findPattern, getSections, sectionNotes, songSteps } from "@/lib/music-sections";
import { audioExamples } from "./audio";

const ctx = { projectId: "p", id: (slug: string) => `p--ex--${slug}` };
const musicModule = audioExamples.find((module) => module.collection === "music")!;
const tracks = musicModule.build(ctx) as unknown as MusicTrack[];

describe.each(tracks.map((track) => [track.name, track] as const))("%s example", (_, track) => {
  const sections = getSections(track);

  it("has an intro that plays once before the loop", () => {
    expect(track.sections?.length).toBeGreaterThanOrEqual(2);
    const loopIndex = sections.findIndex((section) => section.id === track.loopStartId);
    expect(loopIndex).toBeGreaterThan(0);
    expect(songSteps(track, "song", sections[0].id).loopIndex).toBeGreaterThan(0);
  });

  it("keeps the original loop as the loop section", () => {
    const loopSection = sections.find((section) => section.id === track.loopStartId)!;
    for (const channel of track.channels) expect(findPattern(track, loopSection, channel.id)).toBe(channel.patterns[0]);
  });

  it("points every section at a pattern of that channel", () => {
    for (const section of sections) {
      expect(section.patterns.length).toBeGreaterThan(0);
      for (const entry of section.patterns) expect(findPattern(track, section, entry.channelId)).toBeDefined();
    }
  });

  it("fits every note inside its section", () => {
    for (const section of sections) {
      for (const entry of section.patterns) {
        const pattern = findPattern(track, section, entry.channelId)!;
        expect(sectionNotes(track, section, entry.channelId)).toHaveLength(pattern.notes.length);
      }
    }
  });

  it("builds section ids with ctx.id", () => {
    for (const section of sections) expect(section.id.startsWith("p--ex--")).toBe(true);
  });
});

describe("music examples", () => {
  it("include a song with two loop sections that share a linked drums pattern", () => {
    const linked = tracks.some((track) => {
      const sections = getSections(track);
      const loopSections = sections.slice(sections.findIndex((section) => section.id === track.loopStartId));
      const drums = track.channels.find((channel) => channel.name === "Drums")!;
      const drumPatterns = loopSections.map((section) => findPattern(track, section, drums.id)?.id);
      return loopSections.length >= 2 && drumPatterns.every((id) => id && id === drumPatterns[0]);
    });
    expect(linked).toBe(true);
  });
});
