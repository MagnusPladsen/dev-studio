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
});
