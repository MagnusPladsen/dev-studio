import { describe, expect, it } from "vitest";
import type { MusicTrack } from "@/types";
import { audioExamples } from "@/lib/examples/audio";
import { runImporter } from "@/lib/import";
import { differenceIgnoringIds, textFile } from "@/lib/import/test-helpers";
import { songJsonImporter } from "./song-json";

const ctx = { projectId: "p", id: (slug: string) => `p--ex--${slug}` };
const exampleSongs = audioExamples
  .filter((module) => module.collection === "music")
  .flatMap((module) => module.build(ctx) as unknown as MusicTrack[])
  .map((song) => ({ ...song, projectId: "p", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }));

describe("Song JSON import", () => {
  it.each(exampleSongs.map((song) => [song.name, song] as const))("round-trips the %s example with new ids", async (_name, song) => {
    const outcome = await runImporter(songJsonImporter, textFile(JSON.stringify(song, null, 2)));
    if (!outcome.ok) throw new Error(outcome.message);
    const [copy] = outcome.result.items;
    expect(differenceIgnoringIds(song, copy)).toBeNull();
    expect(copy.id).not.toBe(song.id);
  });

  it("rejects other JSON and damaged songs", async () => {
    expect(await runImporter(songJsonImporter, textFile('{"nodes":[]}'))).toEqual({ ok: false, message: expect.stringContaining("isn't a song file") });
    const damaged = { name: "x", bpm: 120, channels: [{ instrument: "square", patterns: [{ notes: [{ pitch: 60 }] }] }] };
    expect(await runImporter(songJsonImporter, textFile(JSON.stringify(damaged)))).toEqual({ ok: false, message: expect.stringContaining("damaged") });
  });

  describe("sections", () => {
    const note = { pitch: 60, start: 0, duration: 1, velocity: 0.8 };
    const baseSong = {
      id: "song-1",
      name: "Sectioned",
      bpm: 120,
      channels: [
        { id: "lead", name: "Lead", instrument: "square", volume: 1, patterns: [{ id: "lead-a", notes: [note] }, { id: "lead-c", notes: [] }] },
        { id: "bass", name: "Bass", instrument: "triangle", volume: 1, patterns: [{ id: "bass-a", notes: [note] }] },
      ],
    };
    const importSong = async (song: object): Promise<MusicTrack> => {
      const outcome = await runImporter(songJsonImporter, textFile(JSON.stringify(song)));
      if (!outcome.ok) throw new Error(outcome.message);
      return outcome.result.items[0];
    };
    const sectioned = {
      ...baseSong,
      loopStartId: "sec-b",
      sections: [
        { id: "sec-a", name: "A", length: 16, patterns: [{ channelId: "lead", patternId: "lead-a" }, { channelId: "bass", patternId: "bass-a" }] },
        { id: "sec-b", name: "B", length: 16, repeat: 2, patterns: [{ channelId: "lead", patternId: "lead-a" }] },
      ],
    };

    it("keeps sections with fresh ids and refs that all resolve", async () => {
      const song = await importSong(sectioned);
      const [first, second] = song.sections ?? [];
      expect(song.sections).toHaveLength(2);
      expect([first.id, second.id]).not.toContain("sec-a");
      expect([first.id, second.id]).not.toContain("sec-b");
      expect(song.loopStartId).toBe(second.id);
      const channelIds = song.channels.map((channel) => channel.id);
      const patternIds = song.channels.flatMap((channel) => channel.patterns.map((pattern) => pattern.id));
      for (const entry of (song.sections ?? []).flatMap((section) => section.patterns)) {
        expect(channelIds).toContain(entry.channelId);
        expect(patternIds).toContain(entry.patternId);
      }
      expect(first.patterns[0].patternId).toBe(second.patterns[0].patternId);
      expect(second.repeat).toBe(2);
    });

    it("drops a section entry whose pattern is missing", async () => {
      const broken = { ...sectioned, sections: [{ ...sectioned.sections[0], patterns: [{ channelId: "lead", patternId: "nope" }, { channelId: "bass", patternId: "bass-a" }] }, sectioned.sections[1]] };
      const song = await importSong(broken);
      expect(song.sections?.[0].patterns).toHaveLength(1);
      expect(song.sections?.[0].patterns[0].channelId).toBe(song.channels[1].id);
    });

    it("removes a loopStartId that names no section", async () => {
      const song = await importSong({ ...sectioned, loopStartId: "ghost" });
      expect(song.sections).toHaveLength(2);
      expect(song.loopStartId).toBeUndefined();
    });

    it("imports a song whose sections is not an array as legacy", async () => {
      const song = await importSong({ ...sectioned, sections: "oops" });
      expect(song.sections).toBeUndefined();
      expect(song.loopStartId).toBeUndefined();
    });

    it("drops malformed section entries and falls back to legacy when none are left", async () => {
      const mixed = { ...sectioned, sections: [null, 7, { name: "no id", length: 8, patterns: [] }, { id: "x", name: "X", length: 12, patterns: [] }, sectioned.sections[0]] };
      const song = await importSong(mixed);
      expect(song.sections).toHaveLength(1);
      expect(song.loopStartId).toBeUndefined();
      const none = await importSong({ ...sectioned, sections: [null, { id: "x", length: 5, patterns: [] }] });
      expect(none.sections).toBeUndefined();
      expect(none.loopStartId).toBeUndefined();
    });
  });
});
