import type { SfxParams } from "@/types";
import { SFX_VERSION, slideOctavesPerSecond } from "@/lib/audio/sfx-synth";
import type { SfxrParams } from "./sfxr-params";

const SAMPLE_RATE = 44100;
const WAVES: SfxParams["waveType"][] = ["square", "sawtooth", "sine", "noise", "triangle"];
/** The SFX editor's slider ranges. */
const RANGES = {
  frequency: [20, 2400],
  frequencySlide: [-1, 1],
  attackTime: [0, 1],
  sustainTime: [0.01, 1],
  decayTime: [0.01, 2],
  vibratoSpeed: [0, 50],
} as const;
const READABLE: Record<keyof typeof RANGES, string> = {
  frequency: "frequency",
  frequencySlide: "frequency slide",
  attackTime: "attack time",
  sustainTime: "sustain time",
  decayTime: "decay time",
  vibratoSpeed: "vibrato speed",
};
/** sfxr features this tool doesn't have, with the slider that switches each on. */
const UNSUPPORTED: [keyof SfxrParams, string][] = [
  ["p_env_punch", "sustain punch"],
  ["p_freq_limit", "minimum frequency cut-off"],
  ["p_freq_dramp", "delta slide"],
  ["p_arp_mod", "pitch jump (arpeggio)"],
  ["p_duty", "square duty"],
  ["p_duty_ramp", "duty sweep"],
  ["p_pha_offset", "flanger"],
  ["p_pha_ramp", "flanger sweep"],
  ["p_lpf_ramp", "low-pass sweep"],
  ["p_hpf_ramp", "high-pass sweep"],
];

const clamp = (value: number, [min, max]: readonly [number, number]) => Math.min(max, Math.max(min, value));
const round = (value: number, digits = 3) => Number(value.toFixed(digits));
const seconds = (slider: number) => (slider * slider * 100000) / SAMPLE_RATE;
const hertz = (slider: number) => (8 * SAMPLE_RATE * (slider * slider + 0.001)) / 100;

/**
 * sfxr multiplies the period by the same factor every sample, so its pitch moves a fixed number of octaves per second,
 * which is what the version 2 slide is. Turns that rate back into the slider value.
 */
function curvedSlide(sfxr: SfxrParams): number {
  if (!sfxr.p_freq_ramp) return 0;
  const periodMultiplier = 1 - Math.pow(sfxr.p_freq_ramp, 3) * 0.01;
  const octavesPerSecond = -SAMPLE_RATE * Math.log2(periodMultiplier);
  return Math.sign(octavesPerSecond) * Math.sqrt(Math.abs(octavesPerSecond) / slideOctavesPerSecond(1));
}

/** Maps jsfxr settings onto this tool's SFX parameters, with a warning for everything that changes on the way. */
export function sfxrToParams(sfxr: SfxrParams): { params: SfxParams; warnings: string[] } {
  const warnings: string[] = [];
  const waveType = WAVES[sfxr.wave_type];
  if (!waveType) warnings.push(`Wave type ${sfxr.wave_type} isn't one this tool has, so it uses a square wave.`);

  const raw = {
    frequency: hertz(sfxr.p_base_freq),
    attackTime: seconds(sfxr.p_env_attack),
    sustainTime: seconds(sfxr.p_env_sustain),
    decayTime: seconds(sfxr.p_env_decay),
    vibratoSpeed: (Math.pow(sfxr.p_vib_speed, 2) * 0.01 * SAMPLE_RATE) / (2 * Math.PI),
    frequencySlide: curvedSlide(sfxr),
  };
  const capped = (Object.keys(RANGES) as (keyof typeof RANGES)[]).filter((key) => clamp(raw[key], RANGES[key]) !== raw[key]);
  const fit = (key: keyof typeof RANGES) => round(clamp(raw[key], RANGES[key]));

  const params: SfxParams = {
    waveType: waveType ?? "square",
    frequency: round(clamp(raw.frequency, RANGES.frequency), 0),
    frequencySlide: fit("frequencySlide"),
    repeatSpeed: round(clamp(sfxr.p_repeat_speed, [0, 1]), 2),
    attackTime: fit("attackTime"),
    sustainTime: fit("sustainTime"),
    decayTime: fit("decayTime"),
    hpFilterCutoff: round(clamp(sfxr.p_hpf_freq, [0, 1]), 2),
    lpFilterCutoff: round(clamp(sfxr.p_lpf_freq, [0, 1]), 2),
    lpFilterResonance: round(clamp(sfxr.p_lpf_resonance, [0, 1]), 2),
    volume: round(clamp(Math.exp(sfxr.sound_vol) - 1, [0, 1]), 2),
    vibratoDepth: round(clamp(sfxr.p_vib_strength * 0.5, [0, 1])),
    vibratoSpeed: fit("vibratoSpeed"),
    version: SFX_VERSION,
  };

  if (capped.length) warnings.push(`Capped to this tool's ranges: ${capped.map((key) => READABLE[key]).join(", ")}.`);
  const missing = UNSUPPORTED.filter(([key]) => sfxr[key] !== 0 && !(key.startsWith("p_duty") && sfxr.wave_type !== 0)).map(([, label]) => label);
  if (missing.length) warnings.push(`This tool has no ${missing.join(", ")}; those parts of the sound are left out.`);
  return { params, warnings };
}
