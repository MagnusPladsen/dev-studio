import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { SfxParams } from "@/types";
import { SAMPLE_RATE, SFX_VERSION, repeatSamples, slideOctavesPerSecond, synthesize } from "./sfx-synth";

const BASE: SfxParams = {
  waveType: "square",
  frequency: 440,
  frequencySlide: 0,
  repeatSpeed: 0,
  sustainTime: 0.1,
  decayTime: 0.2,
  attackTime: 0,
  hpFilterCutoff: 0,
  lpFilterCutoff: 1,
  lpFilterResonance: 0,
  volume: 0.5,
  vibratoDepth: 0,
  vibratoSpeed: 0,
};
const V2: SfxParams = { ...BASE, version: SFX_VERSION };
const FLAT: SfxParams = { ...V2, waveType: "sine", sustainTime: 1, decayTime: 0.01, volume: 1 };

function fingerprint(samples: Float32Array): string {
  return createHash("sha256").update(Buffer.from(samples.buffer)).digest("hex").slice(0, 16);
}

function rms(samples: Float32Array, from = 0, to = samples.length): number {
  let sum = 0;
  for (let i = from; i < to; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / (to - from));
}

function risingZeroCrossings(samples: Float32Array, from: number, to: number): number {
  let count = 0;
  for (let i = from + 1; i < to; i++) if (samples[i - 1] < 0 && samples[i] >= 0) count++;
  return count;
}

describe("original synth (no version)", () => {
  // Fingerprints taken from the synth before version 2 existed: saved sounds must not change.
  it.each([
    ["jump", { ...BASE, frequency: 300, frequencySlide: 0.25, sustainTime: 0.08 }, 12349, "73bfdecc271c19e9"],
    ["low-passed saw", { ...BASE, waveType: "sawtooth", frequency: 1100, frequencySlide: -0.35, lpFilterCutoff: 0.5, lpFilterResonance: 0.3 }, 13231, "e491e47c968c0ee0"],
    ["high-passed hurt", { ...BASE, frequency: 420, frequencySlide: -0.9, hpFilterCutoff: 0.4, attackTime: 0.02 }, 14112, "1e8a3723d7b24c06"],
    ["repeating triangle", { ...BASE, waveType: "triangle", repeatSpeed: 0.4, vibratoDepth: 0.1, vibratoSpeed: 8 }, 13231, "933f5ca12d0bb253"],
    ["sine", { ...BASE, waveType: "sine", frequency: 660, decayTime: 0.5 }, 26460, "6b2d94ace96a5d88"],
  ] as [string, SfxParams, number, string][])("plays %s exactly as before", (_, params, length, hash) => {
    const samples = synthesize(params);
    expect(samples.length).toBe(length);
    expect(fingerprint(samples)).toBe(hash);
  });
});

describe("seeded noise", () => {
  it.each([["original", BASE], ["version 2", V2]])("gives the same samples every time (%s synth)", (_, base) => {
    const explosion = { ...base, waveType: "noise" as const, frequency: 120, lpFilterCutoff: 0.4, seed: 1234 };
    // the waveform, Play and the WAV export each call synthesize, so equal calls mean they all match
    expect(fingerprint(synthesize(explosion))).toBe(fingerprint(synthesize(explosion)));
    expect(fingerprint(synthesize({ ...explosion, seed: 99 }))).not.toBe(fingerprint(synthesize(explosion)));
  });

  it("is repeatable for sounds saved without a seed", () => {
    const noise = { ...BASE, waveType: "noise" as const };
    expect(fingerprint(synthesize(noise))).toBe(fingerprint(synthesize(noise)));
  });
});

describe("version 2 high-pass filter", () => {
  it("removes low frequencies and keeps high ones", () => {
    const low = { ...FLAT, frequency: 80 };
    const high = { ...FLAT, frequency: 2400 };
    const filtered = (params: SfxParams) => rms(synthesize({ ...params, hpFilterCutoff: 0.3 }), 4410) / rms(synthesize(params), 4410);
    expect(filtered(low)).toBeLessThan(0.3);
    expect(filtered(high)).toBeGreaterThan(0.85);
  });
});

describe("version 2 slide", () => {
  it("moves in octaves, so pitch rises on a curve", () => {
    expect(slideOctavesPerSecond(1)).toBe(20);
    expect(slideOctavesPerSecond(-0.5)).toBe(-5);
    // 2 octaves per second from 200 Hz: 400 Hz halfway (a straight line would be at 500 Hz)
    const samples = synthesize({ ...FLAT, frequency: 200, frequencySlide: Math.sqrt(2 / 20) });
    const halfway = risingZeroCrossings(samples, 0.45 * SAMPLE_RATE, 0.55 * SAMPLE_RATE);
    expect(halfway).toBeGreaterThanOrEqual(39);
    expect(halfway).toBeLessThanOrEqual(41);
  });
});

describe("version 2 repeat", () => {
  it("restarts the slide like sfxr", () => {
    expect(repeatSamples(0)).toBe(0);
    expect(repeatSamples(1)).toBe(32);
    const rising = { ...FLAT, frequency: 200, frequencySlide: 0.5, repeatSpeed: 0.5 };
    const restart = repeatSamples(rising.repeatSpeed);
    const window = Math.floor(restart / 2);
    const crossings = (params: SfxParams, from: number) => risingZeroCrossings(synthesize(params), from, from + window);
    const first = crossings(rising, 0);
    expect(Math.abs(crossings(rising, restart * 3) - first)).toBeLessThanOrEqual(1);
    expect(crossings({ ...rising, repeatSpeed: 0 }, restart * 3)).toBeGreaterThan(first * 2);
  });
});
