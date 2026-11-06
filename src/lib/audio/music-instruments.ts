import type { MusicChannel, MusicEnvelope, MusicVibrato } from "@/types";

/** What the synth needs to know about a channel's sound. */
export type MusicVoice = Pick<MusicChannel, "instrument" | "envelope" | "vibrato">;

export interface InstrumentPreset {
  id: string;
  label: string;
  group: "Tones" | "Drums";
  /** Missing keeps the channel's wave (Classic works with any wave). */
  wave?: string;
  envelope?: MusicEnvelope;
  vibrato?: MusicVibrato;
}

export const CLASSIC_PRESET = "classic";
export const CUSTOM_PRESET = "custom";

export const WAVES = [
  { label: "Square", value: "square" },
  { label: "Sawtooth", value: "sawtooth" },
  { label: "Sine", value: "sine" },
  { label: "Triangle", value: "triangle" },
  { label: "Noise", value: "noise" },
] as const;

/** Hand-made starting points. Classic is how every note sounded before instruments existed. */
export const INSTRUMENT_PRESETS: InstrumentPreset[] = [
  { id: CLASSIC_PRESET, label: "Classic", group: "Tones" },
  {
    id: "lead",
    label: "Lead",
    group: "Tones",
    wave: "square",
    envelope: { attack: 0.01, decay: 0.15, sustain: 0.7, release: 0.1 },
    vibrato: { rate: 5.5, depth: 15, delay: 0.2 },
  },
  { id: "soft-pad", label: "Soft Pad", group: "Tones", wave: "triangle", envelope: { attack: 0.3, decay: 0.4, sustain: 0.8, release: 0.6 } },
  { id: "bass", label: "Bass", group: "Tones", wave: "sawtooth", envelope: { attack: 0.005, decay: 0.2, sustain: 0.6, release: 0.06 } },
  { id: "pluck", label: "Pluck", group: "Tones", wave: "triangle", envelope: { attack: 0.003, decay: 0.3, sustain: 0, release: 0.1 } },
  { id: "bell", label: "Bell", group: "Tones", wave: "sine", envelope: { attack: 0.002, decay: 1.2, sustain: 0, release: 0.8 } },
  {
    id: "chip-square",
    label: "Chip Square",
    group: "Tones",
    wave: "square",
    envelope: { attack: 0.002, decay: 0, sustain: 1, release: 0.02 },
    vibrato: { rate: 7, depth: 25, delay: 0.25 },
  },
  { id: "drum-kit", label: "Drum Kit", group: "Drums", wave: "noise", envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.05 } },
  { id: "soft-kit", label: "Soft Kit", group: "Drums", wave: "noise", envelope: { attack: 0.004, decay: 0.25, sustain: 0.1, release: 0.15 } },
];

/** Where the Edit sliders start for a Classic channel, which has no ADSR of its own. */
export const STARTING_ENVELOPE: MusicEnvelope = { attack: 0.005, decay: 0.3, sustain: 0.5, release: 0.1 };
export const STARTING_VIBRATO: MusicVibrato = { rate: 6, depth: 0, delay: 0 };

export function findPreset(id: string): InstrumentPreset | undefined {
  return INSTRUMENT_PRESETS.find((p) => p.id === id);
}

/** The preset a channel shows: Classic when nothing was picked, Custom when its sound was edited by hand. */
export function channelPreset(channel: Pick<MusicChannel, "preset" | "envelope" | "vibrato">): string {
  if (channel.preset) return channel.preset;
  return channel.envelope || channel.vibrato ? CUSTOM_PRESET : CLASSIC_PRESET;
}

function withoutSound(channel: MusicChannel): MusicChannel {
  const rest = { ...channel };
  delete rest.preset;
  delete rest.envelope;
  delete rest.vibrato;
  return rest;
}

/** The channel playing `presetId`. Classic drops the stored sound, so the channel is saved as it was before. */
export function applyPreset(channel: MusicChannel, presetId: string): MusicChannel {
  const preset = findPreset(presetId);
  if (!preset) return channel;
  const base = { ...withoutSound(channel), instrument: preset.wave ?? channel.instrument };
  if (preset.id === CLASSIC_PRESET) return base;
  return {
    ...base,
    preset: preset.id,
    ...(preset.envelope && { envelope: { ...preset.envelope } }),
    ...(preset.vibrato && { vibrato: { ...preset.vibrato } }),
  };
}

/**
 * A hand edit of the sound, which makes the preset Custom. A Classic channel takes on the envelope the
 * sliders showed, so what you see is what plays.
 */
export function editSound(channel: MusicChannel, change: { envelope?: MusicEnvelope; vibrato?: MusicVibrato }): MusicChannel {
  const vibrato = change.vibrato ?? channel.vibrato;
  return {
    ...withoutSound(channel),
    preset: CUSTOM_PRESET,
    envelope: change.envelope ?? channel.envelope ?? { ...STARTING_ENVELOPE },
    ...(vibrato && { vibrato }),
  };
}

/** A new wave. Classic stays Classic, since it works with any wave; any other preset becomes Custom. */
export function editWave(channel: MusicChannel, wave: string): MusicChannel {
  if (channelPreset(channel) === CLASSIC_PRESET) return { ...channel, instrument: wave };
  return { ...channel, instrument: wave, preset: CUSTOM_PRESET };
}

const isLevel = (value: unknown, max = Infinity) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= max;

/** Drops sound settings the synth can't play (from a hand-edited or damaged file), leaving the channel Classic. */
export function playableSound(channel: MusicChannel): MusicChannel {
  const { envelope, vibrato } = channel;
  const isEnvelopeOk = !envelope || (isLevel(envelope.attack) && isLevel(envelope.decay) && isLevel(envelope.sustain, 1) && isLevel(envelope.release));
  const isVibratoOk = !vibrato || (isLevel(vibrato.rate) && vibrato.rate > 0 && isLevel(vibrato.depth) && isLevel(vibrato.delay));
  return isEnvelopeOk && isVibratoOk ? channel : withoutSound(channel);
}
