import { describe, expect, it } from "vitest";
import type { SfxParams } from "@/types";
import {
  NO_FINISH,
  applyFades,
  applyLevel,
  changePitch,
  peakOf,
  readFinish,
  renderSound,
  reverseSamples,
  trimSamples,
} from "./sfx-finish";
import { SAMPLE_RATE, SFX_VERSION, synthesize } from "./sfx-synth";

const SOUND: SfxParams = {
  waveType: "square",
  frequency: 440,
  frequencySlide: 0.2,
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
  version: SFX_VERSION,
};

const ramp = (length: number) => Float32Array.from({ length }, (_, i) => i / length);
const ones = (length: number) => new Float32Array(length).fill(1);

describe("renderSound", () => {
  it("should leave a sound without finish settings exactly as synthesized", () => {
    expect(renderSound(SOUND)).toEqual(synthesize(SOUND));
  });

  it("should give the same samples every time, so preview, waveform and WAV match", () => {
    const finished = { ...SOUND, waveType: "noise" as const, seed: 7, finish: { ...NO_FINISH, trimStart: 0.1, fadeOut: 0.05, normalize: true, pitch: 3, reverse: true } };
    expect(renderSound(finished)).toEqual(renderSound(finished));
  });

  it("should trim, then fade, then normalize", () => {
    const samples = renderSound({ ...SOUND, finish: { ...NO_FINISH, trimStart: 0.25, trimEnd: 0.25, fadeIn: 0.01, normalize: true } });
    expect(Math.abs(samples.length - synthesize(SOUND).length * 0.5)).toBeLessThanOrEqual(1);
    expect(Math.abs(samples[0])).toBe(0);
    expect(peakOf(samples)).toBeCloseTo(Math.pow(10, -1 / 20), 5);
  });
});

describe("readFinish", () => {
  it("should fall back to no editing when the settings are missing or broken", () => {
    expect(readFinish(undefined)).toEqual(NO_FINISH);
    expect(readFinish({ trimStart: "a lot", gainDb: Number.NaN, reverse: "yes" })).toEqual(NO_FINISH);
  });

  it("should always keep some of the sound when both trims are large", () => {
    const finish = readFinish({ trimStart: 0.7, trimEnd: 0.7, gainDb: 99, pitch: -40 });
    expect(finish.trimStart + finish.trimEnd).toBeCloseTo(0.95, 10);
    expect(finish.gainDb).toBe(12);
    expect(finish.pitch).toBe(-12);
  });
});

describe("changePitch", () => {
  it("should halve the length when going up an octave", () => {
    expect(changePitch(ramp(1000), 12).length).toBe(500);
  });

  it("should double the length when going down an octave, interpolating between samples", () => {
    const lower = changePitch(ramp(1000), -12);
    expect(lower.length).toBe(2000);
    expect(lower[1]).toBeCloseTo(0.0005, 6);
  });

  it("should return the same samples at 0 semitones", () => {
    const samples = ramp(10);
    expect(changePitch(samples, 0)).toBe(samples);
  });
});

describe("trimSamples", () => {
  it("should cut a share off each end", () => {
    expect(Array.from(trimSamples(ramp(10), 0.2, 0.3)).map((value) => Math.round(value * 10))).toEqual([2, 3, 4, 5, 6]);
  });

  it("should keep at least one sample", () => {
    expect(trimSamples(ramp(10), 0.5, 0.5).length).toBe(1);
  });
});

describe("applyFades", () => {
  it("should start and end at silence and leave the middle alone", () => {
    const faded = applyFades(ones(SAMPLE_RATE), 0.1, 0.1);
    expect(faded[0]).toBe(0);
    expect(faded[faded.length - 1]).toBe(0);
    expect(faded[SAMPLE_RATE / 2]).toBe(1);
    expect(faded[SAMPLE_RATE * 0.05]).toBeCloseTo(0.5, 5);
  });

  it("should shorten a fade that is longer than the sound", () => {
    const faded = applyFades(ones(100), 5, 0);
    expect(faded[0]).toBe(0);
    expect(faded[99]).toBeCloseTo(0.99, 5);
  });
});

describe("applyLevel", () => {
  it("should normalize the loudest sample to -1 dB", () => {
    expect(peakOf(applyLevel(Float32Array.from([0.1, -0.25, 0.2]), true, 0))).toBeCloseTo(0.891, 3);
  });

  it("should apply gain in decibels after normalizing", () => {
    expect(applyLevel(Float32Array.from([0.5]), false, -6)[0]).toBeCloseTo(0.25, 2);
  });

  it("should leave silence silent", () => {
    expect(applyLevel(new Float32Array(4), true, 6)).toEqual(new Float32Array(4));
  });
});

describe("reverseSamples", () => {
  it("should play the sound backwards without changing the original", () => {
    const samples = Float32Array.from([1, 2, 3]);
    expect(Array.from(reverseSamples(samples))).toEqual([3, 2, 1]);
    expect(Array.from(samples)).toEqual([1, 2, 3]);
  });
});
