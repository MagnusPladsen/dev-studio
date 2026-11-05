import { describe, expect, it } from "vitest";
import type { SfxParams } from "@/types";
import { SFX_GROUPS, keepLocked, mutateParams, type SfxGroupId } from "./sfx-explore";

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
  version: 2,
  seed: 5,
};

/** Always changes everything: below every chance, and nudges up by 60% of the step. */
const alwaysChange = () => {
  let call = 0;
  return () => (call++ % 2 === 0 ? 0 : 0.8);
};

const keysOf = (id: SfxGroupId) => SFX_GROUPS.find((group) => group.id === id)!.sliders.map((slider) => slider.key);
const ALL_KEYS = SFX_GROUPS.flatMap((group) => group.sliders.map((slider) => slider.key));

describe("mutateParams", () => {
  it("can change every slider and the wave type", () => {
    const next = mutateParams({ ...BASE, frequency: 1000, volume: 0.5, lpFilterCutoff: 0.5 }, new Set(), alwaysChange());
    const changed = ALL_KEYS.filter((key) => next[key] !== BASE[key]);
    expect(changed.sort()).toEqual([...ALL_KEYS].sort());
    expect(ALL_KEYS).toHaveLength(12);
  });

  it("changes the wave type when the dice say so", () => {
    expect(mutateParams(BASE, new Set(), () => 0).waveType).not.toBe(BASE.waveType);
    expect(mutateParams(BASE, new Set(), () => 0.99).waveType).toBe(BASE.waveType);
  });

  it("leaves locked groups alone", () => {
    const locked = new Set<SfxGroupId>(["pitch", "filter", "wave"]);
    const next = mutateParams(BASE, locked, alwaysChange());
    for (const key of [...keysOf("pitch"), ...keysOf("filter")]) expect(next[key]).toBe(BASE[key]);
    expect(next.waveType).toBe(BASE.waveType);
    expect(next.seed).toBe(BASE.seed);
    expect(next.sustainTime).not.toBe(BASE.sustainTime);
    expect(next.vibratoSpeed).not.toBe(BASE.vibratoSpeed);
  });

  it("changes nothing when every group is locked", () => {
    const next = mutateParams(BASE, new Set(SFX_GROUPS.map((group) => group.id)), alwaysChange());
    expect(next).toEqual(BASE);
  });

  it("keeps values inside the slider ranges", () => {
    for (let i = 0; i < 200; i++) {
      const next = mutateParams(BASE, new Set());
      for (const slider of SFX_GROUPS.flatMap((group) => group.sliders)) {
        expect(next[slider.key]).toBeGreaterThanOrEqual(slider.min);
        expect(next[slider.key]).toBeLessThanOrEqual(slider.max);
      }
    }
  });

  it("keeps the finish settings", () => {
    const finish = { trimStart: 0.1, trimEnd: 0, fadeIn: 0, fadeOut: 0.2, normalize: true, gainDb: 0, pitch: 0, reverse: false };
    expect(mutateParams({ ...BASE, finish }, new Set(), alwaysChange()).finish).toEqual(finish);
  });
});

describe("keepLocked", () => {
  it("copies locked groups from the current sound into a generated one", () => {
    const generated: SfxParams = { ...BASE, waveType: "noise", frequency: 90, decayTime: 0.9, lpFilterCutoff: 0.3, seed: 99 };
    const next = keepLocked(generated, BASE, new Set<SfxGroupId>(["envelope", "wave"]));
    expect(next.decayTime).toBe(BASE.decayTime);
    expect(next.waveType).toBe("square");
    expect(next.seed).toBe(BASE.seed);
    expect(next.frequency).toBe(90);
    expect(next.lpFilterCutoff).toBe(0.3);
  });
});
