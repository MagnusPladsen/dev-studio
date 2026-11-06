import type { SfxParams } from "@/types";

export const SAMPLE_RATE = 44100;
/** The synth new sounds use. Sounds without a version were made before it and keep playing as they always did. */
export const SFX_VERSION = 2;
const DEFAULT_SEED = 1;
/** Version 2 slide: octaves per second at the slider's ends (±1); squared so small values give fine control. */
const MAX_SLIDE_OCTAVES_PER_SECOND = 20;

type Filter = (sample: number) => number;

/** A new noise seed, so each generated sound gets its own noise that then stays the same. */
export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 32);
}

/** mulberry32: the same seed always gives the same numbers, so preview, waveform and WAV match. */
function seededRandom(seed: unknown): () => number {
  let state = (typeof seed === "number" ? seed : DEFAULT_SEED) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createNoise(random: () => number) {
  const buffer = new Float32Array(32);
  for (let i = 0; i < 32; i++) buffer[i] = random() * 2 - 1;
  return (index: number, freq: number) => {
    const sample = buffer[index % 32];
    if (random() < freq / SAMPLE_RATE) buffer[Math.floor(random() * 32)] = random() * 2 - 1;
    return sample;
  };
}

function createLowPass(params: SfxParams): Filter {
  const cutoff = Math.pow(params.lpFilterCutoff, 3) * 0.1;
  let position = 0;
  let delta = 0;
  return (sample) => {
    delta += (sample - position) * cutoff;
    delta *= 1 - (0.5 + params.lpFilterResonance * 0.45);
    position += delta;
    return position;
  };
}

/** sfxr's one-pole high-pass. sfxr runs it 8 times per sample, hence the 8th power. */
function createHighPass(cutoff: number): Filter {
  const keep = Math.pow(1 - cutoff * cutoff * 0.1, 8);
  let previousInput = 0;
  let output = 0;
  return (input) => {
    output = (output + input - previousInput) * keep;
    previousInput = input;
    return output;
  };
}

function waveSample(waveType: SfxParams["waveType"], phaseNorm: number): number {
  switch (waveType) {
    case "square":
      return phaseNorm < 0.5 ? 1 : -1;
    case "sawtooth":
      return 2 * phaseNorm - 1;
    case "sine":
      return Math.sin(phaseNorm * Math.PI * 2);
    case "triangle":
      return phaseNorm < 0.5 ? 4 * phaseNorm - 1 : 3 - 4 * phaseNorm;
    default:
      return 0;
  }
}

function envelopeAt(params: SfxParams, t: number): number {
  let envelope = 1;
  if (t < params.attackTime) {
    envelope = params.attackTime > 0 ? t / params.attackTime : 1;
  } else if (t >= params.attackTime + params.sustainTime) {
    const decayT = t - params.attackTime - params.sustainTime;
    envelope = params.decayTime > 0 ? 1 - decayT / params.decayTime : 0;
  }
  return Math.max(0, Math.min(1, envelope));
}

function withVibrato(params: SfxParams, freq: number, t: number): number {
  if (params.vibratoDepth <= 0) return freq;
  return freq + Math.sin(t * params.vibratoSpeed * Math.PI * 2) * params.vibratoDepth * freq;
}

function emptyBuffer(params: SfxParams): Float32Array {
  return new Float32Array(Math.ceil((params.attackTime + params.sustainTime + params.decayTime) * SAMPLE_RATE));
}

/** Octaves per second for a version 2 slide value. */
export function slideOctavesPerSecond(slide: number): number {
  return MAX_SLIDE_OCTAVES_PER_SECOND * slide * Math.abs(slide);
}

/** sfxr's repeat length in samples: the slide starts over this often. 0 = never. */
export function repeatSamples(repeatSpeed: number): number {
  return repeatSpeed > 0 ? Math.floor(Math.pow(1 - repeatSpeed, 2) * 20000 + 32) : 0;
}

export function synthesize(params: SfxParams): Float32Array {
  return params.version === SFX_VERSION ? synthesizeV2(params) : synthesizeV1(params);
}

/** The original synth, kept sample for sample (only its noise is now seeded) so saved sounds don't change. */
function synthesizeV1(params: SfxParams): Float32Array {
  const buffer = emptyBuffer(params);
  const noise = params.waveType === "noise" ? createNoise(seededRandom(params.seed)) : null;
  const lowPass = params.lpFilterCutoff < 1 ? createLowPass(params) : null;
  let phase = 0;
  for (let i = 0; i < buffer.length; i++) {
    const t = i / SAMPLE_RATE;
    const freq = withVibrato(params, Math.max(1, params.frequency + params.frequencySlide * t * 1000), t);
    const period = SAMPLE_RATE / freq;
    phase += 1;
    if (params.repeatSpeed > 0 && phase > period * params.repeatSpeed * 100) phase = 0;
    let sample = noise ? noise(Math.floor(phase), freq) : waveSample(params.waveType, (phase % period) / period);
    if (lowPass) sample = lowPass(sample);
    if (params.hpFilterCutoff > 0) sample -= sample * Math.pow(params.hpFilterCutoff, 2) * 0.1;
    buffer[i] = sample * envelopeAt(params, t) * params.volume;
  }
  return buffer;
}

/** Curved slide, a real high-pass filter, and Repeat restarting the slide like sfxr. */
function synthesizeV2(params: SfxParams): Float32Array {
  const buffer = emptyBuffer(params);
  const noise = params.waveType === "noise" ? createNoise(seededRandom(params.seed)) : null;
  const lowPass = params.lpFilterCutoff < 1 ? createLowPass(params) : null;
  const highPass = params.hpFilterCutoff > 0 ? createHighPass(params.hpFilterCutoff) : null;
  const restartEvery = repeatSamples(params.repeatSpeed);
  const octavesPerSecond = slideOctavesPerSecond(params.frequencySlide);
  let phase = 0;
  for (let i = 0; i < buffer.length; i++) {
    const t = i / SAMPLE_RATE;
    const slideT = restartEvery ? (i % restartEvery) / SAMPLE_RATE : t;
    const slid = Math.min(SAMPLE_RATE / 2, Math.max(1, params.frequency * 2 ** (octavesPerSecond * slideT)));
    const freq = withVibrato(params, slid, t);
    phase = (phase + freq / SAMPLE_RATE) % 1;
    let sample = noise ? noise(i, freq) : waveSample(params.waveType, phase);
    if (lowPass) sample = lowPass(sample);
    if (highPass) sample = highPass(sample);
    buffer[i] = sample * envelopeAt(params, t) * params.volume;
  }
  return buffer;
}
