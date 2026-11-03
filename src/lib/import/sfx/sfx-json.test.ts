import { describe, expect, it } from "vitest";
import type { SoundEffect } from "@/types";
import { audioExamples } from "@/lib/examples/audio";
import { runImporter } from "@/lib/import";
import { differenceIgnoringIds, textFile } from "@/lib/import/test-helpers";
import { soundJsonImporter } from "./sfx-json";

const ctx = { projectId: "p", id: (slug: string) => `p--ex--${slug}` };
const exampleSounds = audioExamples
  .filter((module) => module.collection === "sounds")
  .flatMap((module) => module.build(ctx) as unknown as SoundEffect[])
  .map((sound) => ({ ...sound, projectId: "p", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }));

describe("Sound JSON import", () => {
  it("round-trips every example sound, one file holding them all", async () => {
    const outcome = await runImporter(soundJsonImporter, textFile(JSON.stringify(exampleSounds)));
    if (!outcome.ok) throw new Error(outcome.message);
    expect(outcome.result.items).toHaveLength(exampleSounds.length);
    expect(differenceIgnoringIds(exampleSounds, outcome.result.items)).toBeNull();
  });

  it("rejects other JSON and damaged sounds", async () => {
    expect(await runImporter(soundJsonImporter, textFile('{"wave_type":1}'))).toEqual({ ok: false, message: expect.stringContaining("isn't a sound file") });
    expect(await runImporter(soundJsonImporter, textFile('{"name":"x","params":{"waveType":"square"}}'))).toEqual({ ok: false, message: expect.stringContaining("damaged") });
  });
});
