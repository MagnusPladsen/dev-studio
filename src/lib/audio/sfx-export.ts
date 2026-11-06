import type { SfxParams } from "@/types";
import { createZip, uniqueNames } from "@/lib/zip";
import { renderSound } from "./sfx-finish";
import { SAMPLE_RATE } from "./sfx-synth";
import { encodeWav, resample, type WavBitDepth } from "./wav";

export interface WavFormat {
  sampleRate: 22050 | 44100 | 48000;
  bitDepth: WavBitDepth;
}

export const WAV_SAMPLE_RATES: WavFormat["sampleRate"][] = [22050, 44100, 48000];
export const WAV_BIT_DEPTHS: WavBitDepth[] = [16, 8];
export const DEFAULT_WAV_FORMAT: WavFormat = { sampleRate: 44100, bitDepth: 16 };

export interface NamedSound {
  name: string;
  params: SfxParams;
}

export function describeWavFormat(format: WavFormat): string {
  return `${format.bitDepth}-bit mono, ${format.sampleRate / 1000} kHz`;
}

/** Characters most file systems refuse, and leading/trailing dots and spaces. */
export function safeFileName(name: string, fallback = "sound"): string {
  const cleaned = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").replace(/^[.\s]+|[.\s]+$/g, "");
  return cleaned || fallback;
}

/** The sound as it plays (synth + finish), written as a WAV in the chosen format. */
export function soundToWav(params: SfxParams, format: WavFormat): Uint8Array<ArrayBuffer> {
  const samples = resample(renderSound(params), SAMPLE_RATE, format.sampleRate);
  return new Uint8Array(encodeWav(samples, format.sampleRate, format.bitDepth));
}

/** One WAV per sound in a zip. Sounds with the same name get " (2)", " (3)"… */
export function soundsToZip(sounds: NamedSound[], format: WavFormat, modified?: Date): Uint8Array<ArrayBuffer> {
  const names = uniqueNames(sounds.map((sound) => `${safeFileName(sound.name)}.wav`));
  return createZip(
    sounds.map((sound, i) => ({ name: names[i], data: soundToWav(sound.params, format) })),
    modified
  );
}
