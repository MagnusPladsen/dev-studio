import { describe, expect, it } from "vitest";
import type { MusicChannel } from "@/types";
import { applyPreset, channelPreset, CLASSIC_PRESET, CUSTOM_PRESET, editSound, editWave, INSTRUMENT_PRESETS, playableSound, STARTING_ENVELOPE } from "./music-instruments";

const classic: MusicChannel = { id: "c", name: "Melody", instrument: "sawtooth", volume: 0.5, patterns: [{ id: "p", notes: [] }] };

describe("instrument presets", () => {
  it("have unique ids, and every one but Classic sets a wave and an envelope", () => {
    expect(new Set(INSTRUMENT_PRESETS.map((p) => p.id)).size).toBe(INSTRUMENT_PRESETS.length);
    for (const preset of INSTRUMENT_PRESETS.filter((p) => p.id !== CLASSIC_PRESET)) {
      expect(preset.wave).toBeTruthy();
      expect(preset.envelope).toBeTruthy();
    }
  });

  it("drum kits are noise", () => {
    for (const preset of INSTRUMENT_PRESETS.filter((p) => p.group === "Drums")) expect(preset.wave).toBe("noise");
  });
});

describe("applyPreset", () => {
  it("sets the wave, envelope and vibrato", () => {
    const lead = applyPreset(classic, "lead");
    expect(lead).toMatchObject({ preset: "lead", instrument: "square", envelope: { attack: 0.01 }, vibrato: { rate: 5.5 } });
    expect(applyPreset(lead, "soft-pad")).not.toHaveProperty("vibrato");
  });

  it("Classic keeps the wave and saves the channel exactly as before instruments", () => {
    expect(applyPreset(applyPreset(classic, "lead"), CLASSIC_PRESET)).toEqual({ ...classic, instrument: "square" });
    expect(applyPreset(classic, CLASSIC_PRESET)).toEqual(classic);
  });

  it("copies the preset's settings, so editing one channel never changes the preset", () => {
    const pad = applyPreset(classic, "soft-pad");
    pad.envelope!.attack = 9;
    expect(applyPreset(classic, "soft-pad").envelope!.attack).toBe(0.3);
  });

  it("ignores an unknown preset", () => {
    expect(applyPreset(classic, "nope")).toBe(classic);
  });
});

describe("channelPreset", () => {
  it("is Classic for old songs and Custom for a sound stored without a preset", () => {
    expect(channelPreset(classic)).toBe(CLASSIC_PRESET);
    expect(channelPreset({ envelope: { attack: 0, decay: 0, sustain: 1, release: 0 } })).toBe(CUSTOM_PRESET);
  });
});

describe("hand edits", () => {
  it("make the preset Custom and keep the rest of the sound", () => {
    const edited = editSound(applyPreset(classic, "lead"), { envelope: { attack: 0.5, decay: 0, sustain: 1, release: 0 } });
    expect(edited).toMatchObject({ preset: CUSTOM_PRESET, envelope: { attack: 0.5 }, vibrato: { rate: 5.5 } });
  });

  it("give a Classic channel the envelope the sliders showed", () => {
    const edited = editSound(classic, { vibrato: { rate: 5, depth: 20, delay: 0 } });
    expect(edited).toMatchObject({ preset: CUSTOM_PRESET, envelope: STARTING_ENVELOPE, vibrato: { depth: 20 } });
  });

  it("a new wave keeps Classic Classic, and makes any other preset Custom", () => {
    expect(editWave(classic, "sine")).toEqual({ ...classic, instrument: "sine" });
    expect(editWave(applyPreset(classic, "bass"), "square")).toMatchObject({ preset: CUSTOM_PRESET, instrument: "square" });
  });
});

describe("playableSound", () => {
  it("keeps sound settings the synth can play", () => {
    const lead = applyPreset(classic, "lead");
    expect(playableSound(lead)).toBe(lead);
  });

  it("drops settings that would break playback, such as negative times or a sustain above full", () => {
    const broken = { ...classic, preset: "lead", envelope: { attack: -1, decay: 0, sustain: 1, release: 0 } };
    expect(playableSound(broken)).toEqual(classic);
    expect(playableSound({ ...classic, envelope: { attack: 0, decay: 0, sustain: 2, release: 0 } })).toEqual(classic);
    expect(playableSound({ ...classic, vibrato: { rate: 0, depth: 10, delay: 0 } })).toEqual(classic);
  });
});
