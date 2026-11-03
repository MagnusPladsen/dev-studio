import type { SfxParams, SoundEffect } from "@/types";
import { ImportError, jsonReimporter, oneOrMany, type Importer } from "@/lib/import";
import { assertFileSize } from "@/lib/import/file-size";

const MAX_BYTES = 1024 * 1024;
const WAVES: SfxParams["waveType"][] = ["square", "sawtooth", "sine", "triangle", "noise"];
const NUMBER_KEYS = [
  "frequency",
  "frequencySlide",
  "repeatSpeed",
  "sustainTime",
  "decayTime",
  "attackTime",
  "hpFilterCutoff",
  "lpFilterCutoff",
  "lpFilterResonance",
  "volume",
  "vibratoDepth",
  "vibratoSpeed",
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

function isSfxParams(value: unknown): value is SfxParams {
  return isRecord(value) && WAVES.includes(value.waveType as SfxParams["waveType"]) && NUMBER_KEYS.every((key) => typeof value[key] === "number");
}

function readSound(value: unknown): SoundEffect {
  if (!isRecord(value) || !isRecord(value.params) || typeof value.params.waveType !== "string") {
    throw new ImportError("This isn't a sound file. Export one from the SFX generator with Export → Sound JSON.");
  }
  if (!isSfxParams(value.params)) throw new ImportError("This sound file is damaged: some settings are missing.");
  return {
    ...(value as unknown as SoundEffect),
    id: typeof value.id === "string" ? value.id : "sound",
    name: typeof value.name === "string" && value.name.trim() ? value.name : "Imported sound",
    tags: Array.isArray(value.tags) ? value.tags.filter((tag): tag is string => typeof tag === "string") : [],
  };
}

const reimporter = jsonReimporter<SoundEffect>({
  id: "sound-json",
  label: "Sound JSON (.json)",
  description: "A sound exported from here, as a new sound",
  read: (data) => oneOrMany(data).map(readSound),
});

/** Re-imports the SFX generator's own Sound JSON export. */
export const soundJsonImporter: Importer<SoundEffect> = {
  ...reimporter,
  parse(file) {
    assertFileSize(file, MAX_BYTES);
    return reimporter.parse(file);
  },
};
