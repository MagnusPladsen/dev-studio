import type { SfxParams } from "@/types";
import { randomSeed } from "./sfx-synth";

export type SfxNumberKey = Exclude<keyof SfxParams, "waveType" | "version" | "seed" | "finish">;
export type SfxGroupId = "pitch" | "wave" | "envelope" | "filter" | "effects";

export interface SfxSlider {
  key: SfxNumberKey;
  label: string;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  /** The most one Mutate moves it, either way. */
  nudge: number;
}

export interface SfxGroup {
  id: SfxGroupId;
  label: string;
  sliders: SfxSlider[];
}

export const WAVE_TYPES: SfxParams["waveType"][] = ["square", "sawtooth", "sine", "triangle", "noise"];

const seconds = (value: number) => `${value.toFixed(3)}s`;
const fixed = (digits: number) => (value: number) => value.toFixed(digits);

/** The settings in the order the page shows them. Locks work per group. The wave group also has the wave type. */
export const SFX_GROUPS: SfxGroup[] = [
  {
    id: "pitch",
    label: "Pitch",
    sliders: [
      { key: "frequency", label: "Frequency", min: 20, max: 2400, step: 1, format: (v) => `${v.toFixed(0)} Hz`, nudge: 100 },
      { key: "frequencySlide", label: "Frequency Slide", min: -1, max: 1, step: 0.01, format: fixed(2), nudge: 0.1 },
    ],
  },
  { id: "wave", label: "Wave", sliders: [] },
  {
    id: "envelope",
    label: "Envelope",
    sliders: [
      { key: "attackTime", label: "Attack Time", min: 0, max: 1, step: 0.001, format: seconds, nudge: 0.02 },
      { key: "sustainTime", label: "Sustain Time", min: 0.01, max: 1, step: 0.001, format: seconds, nudge: 0.05 },
      { key: "decayTime", label: "Decay Time", min: 0.01, max: 2, step: 0.001, format: seconds, nudge: 0.1 },
      { key: "volume", label: "Volume", min: 0, max: 1, step: 0.01, format: fixed(2), nudge: 0.05 },
    ],
  },
  {
    id: "filter",
    label: "Filter",
    sliders: [
      { key: "lpFilterCutoff", label: "LP Filter Cutoff", min: 0, max: 1, step: 0.01, format: fixed(2), nudge: 0.1 },
      { key: "lpFilterResonance", label: "LP Filter Resonance", min: 0, max: 1, step: 0.01, format: fixed(2), nudge: 0.1 },
      { key: "hpFilterCutoff", label: "HP Filter Cutoff", min: 0, max: 1, step: 0.01, format: fixed(2), nudge: 0.05 },
    ],
  },
  {
    id: "effects",
    label: "Effects",
    sliders: [
      { key: "vibratoDepth", label: "Vibrato Depth", min: 0, max: 1, step: 0.001, format: fixed(3), nudge: 0.02 },
      { key: "vibratoSpeed", label: "Vibrato Speed", min: 0, max: 50, step: 0.1, format: fixed(1), nudge: 2 },
      { key: "repeatSpeed", label: "Repeat Speed", min: 0, max: 1, step: 0.01, format: fixed(2), nudge: 0.05 },
    ],
  },
];

/** Each setting has this chance to move in one Mutate, like sfxr, so the sound stays recognisable. */
const CHANGE_CHANCE = 0.5;
/** The wave type changes less often: it changes the character of a sound most. */
const WAVE_CHANGE_CHANCE = 0.15;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Nudges every setting in unlocked groups a little. `random` returns 0-1, like Math.random. */
export function mutateParams(params: SfxParams, locked: ReadonlySet<SfxGroupId>, random: () => number = Math.random): SfxParams {
  const next = { ...params };
  for (const group of SFX_GROUPS) {
    if (locked.has(group.id)) continue;
    for (const slider of group.sliders) {
      if (random() >= CHANGE_CHANCE) continue;
      next[slider.key] = clamp(params[slider.key] + (random() * 2 - 1) * slider.nudge, slider.min, slider.max);
    }
  }
  if (!locked.has("wave")) {
    if (random() < WAVE_CHANGE_CHANCE) {
      const others = WAVE_TYPES.filter((wave) => wave !== params.waveType);
      next.waveType = others[Math.floor(random() * others.length)];
    }
    if (next.waveType === "noise") next.seed = Math.floor(random() * 2 ** 32);
  }
  return next;
}

/** A newly generated sound with the locked groups copied over from the current one. */
export function keepLocked(generated: SfxParams, current: SfxParams, locked: ReadonlySet<SfxGroupId>): SfxParams {
  const next = { ...generated };
  for (const group of SFX_GROUPS) {
    if (!locked.has(group.id)) continue;
    for (const slider of group.sliders) next[slider.key] = current[slider.key];
  }
  if (locked.has("wave")) {
    next.waveType = current.waveType;
    next.seed = current.seed ?? randomSeed();
  }
  return next;
}
