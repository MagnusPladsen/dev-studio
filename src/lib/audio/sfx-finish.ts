import type { SfxFinish, SfxParams } from "@/types";
import { SAMPLE_RATE, synthesize } from "./sfx-synth";

export const NO_FINISH: SfxFinish = { trimStart: 0, trimEnd: 0, fadeIn: 0, fadeOut: 0, normalize: false, gainDb: 0, pitch: 0, reverse: false };
/** Trimming always leaves at least this much of the sound. */
export const MIN_KEPT = 0.05;
/** Normalize brings the loudest sample to -1 dB, a little headroom below clipping. */
const NORMALIZE_PEAK = Math.pow(10, -1 / 20);

const clamp = (value: unknown, min: number, max: number, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

/** Finish settings from a saved or imported sound, with anything missing or out of range made safe. */
export function readFinish(value: unknown): SfxFinish {
  const raw = (typeof value === "object" && value !== null ? value : {}) as Record<string, unknown>;
  const trimStart = clamp(raw.trimStart, 0, 1 - MIN_KEPT, 0);
  return {
    trimStart,
    trimEnd: clamp(raw.trimEnd, 0, 1 - MIN_KEPT - trimStart, 0),
    fadeIn: clamp(raw.fadeIn, 0, 2, 0),
    fadeOut: clamp(raw.fadeOut, 0, 2, 0),
    normalize: raw.normalize === true,
    gainDb: clamp(raw.gainDb, -24, 12, 0),
    pitch: clamp(raw.pitch, -12, 12, 0),
    reverse: raw.reverse === true,
  };
}

/** Plays the sound faster or slower, like a tape: +12 semitones is twice as fast and an octave up. */
export function changePitch(samples: Float32Array, semitones: number): Float32Array {
  if (semitones === 0 || samples.length === 0) return samples;
  const rate = Math.pow(2, semitones / 12);
  const out = new Float32Array(Math.max(1, Math.floor(samples.length / rate)));
  for (let i = 0; i < out.length; i++) {
    const position = i * rate;
    const index = Math.floor(position);
    const next = samples[Math.min(index + 1, samples.length - 1)];
    out[i] = samples[index] + (next - samples[index]) * (position - index);
  }
  return out;
}

export function reverseSamples(samples: Float32Array): Float32Array {
  return samples.slice().reverse();
}

/** Cuts a share (0-1) of the sound's length off the start and the end. */
export function trimSamples(samples: Float32Array, start: number, end: number): Float32Array {
  const from = Math.round(samples.length * start);
  const to = Math.max(from + 1, Math.round(samples.length * (1 - end)));
  return samples.slice(from, Math.min(samples.length, to));
}

/** Linear fades, in seconds. Fades longer than the sound are shortened to fit. */
export function applyFades(samples: Float32Array, fadeIn: number, fadeOut: number): Float32Array {
  const inSamples = Math.min(samples.length, Math.round(fadeIn * SAMPLE_RATE));
  const outSamples = Math.min(samples.length, Math.round(fadeOut * SAMPLE_RATE));
  if (!inSamples && !outSamples) return samples;
  const out = samples.slice();
  for (let i = 0; i < inSamples; i++) out[i] *= i / inSamples;
  for (let i = 0; i < outSamples; i++) out[out.length - 1 - i] *= i / outSamples;
  return out;
}

export function peakOf(samples: Float32Array): number {
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  return peak;
}

/** Normalizes (optional) and then applies the gain. */
export function applyLevel(samples: Float32Array, normalize: boolean, gainDb: number): Float32Array {
  const peak = peakOf(samples);
  const factor = (normalize && peak > 0 ? NORMALIZE_PEAK / peak : 1) * Math.pow(10, gainDb / 20);
  return factor === 1 ? samples : samples.map((sample) => sample * factor);
}

/** The sound before trimming: what the waveform shows, with the trimmed parts greyed out. */
export function untrimmed(samples: Float32Array, finish: SfxFinish): Float32Array {
  const pitched = changePitch(samples, finish.pitch);
  return finish.reverse ? reverseSamples(pitched) : pitched;
}

/** Trims, fades and levels a sound that already went through `untrimmed`. */
export function finishUntrimmed(samples: Float32Array, finish: SfxFinish): Float32Array {
  const trimmed = trimSamples(samples, finish.trimStart, finish.trimEnd);
  return applyLevel(applyFades(trimmed, finish.fadeIn, finish.fadeOut), finish.normalize, finish.gainDb);
}

/** The sound as it plays and exports: synthesized, then finished. Sounds without finish settings are left as they are. */
export function renderSound(params: SfxParams): Float32Array {
  const samples = synthesize(params);
  if (!params.finish) return samples;
  const finish = readFinish(params.finish);
  return finishUntrimmed(untrimmed(samples, finish), finish);
}
