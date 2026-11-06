import { describe, expect, it } from "vitest";
import type { SfxParams } from "@/types";
import { renderSound } from "./sfx-finish";
import { safeFileName, soundToWav, soundsToZip } from "./sfx-export";

const SOUND: SfxParams = {
  waveType: "square",
  frequency: 440,
  frequencySlide: 0,
  repeatSpeed: 0,
  sustainTime: 0.1,
  decayTime: 0.1,
  attackTime: 0,
  hpFilterCutoff: 0,
  lpFilterCutoff: 1,
  lpFilterResonance: 0,
  volume: 0.5,
  vibratoDepth: 0,
  vibratoSpeed: 0,
  version: 2,
};

const header = (wav: Uint8Array) => new DataView(wav.buffer, wav.byteOffset, wav.byteLength);

describe("soundToWav", () => {
  it("exports the finished sound at 44.1 kHz 16-bit sample for sample", () => {
    const params = { ...SOUND, finish: { trimStart: 0.5, trimEnd: 0, fadeIn: 0, fadeOut: 0, normalize: false, gainDb: 0, pitch: 0, reverse: false } };
    const wav = soundToWav(params, { sampleRate: 44100, bitDepth: 16 });
    expect(wav.length).toBe(44 + renderSound(params).length * 2);
  });

  it("resamples to the chosen rate and bit depth", () => {
    const wav = soundToWav(SOUND, { sampleRate: 22050, bitDepth: 8 });
    const view = header(wav);
    expect(view.getUint32(24, true)).toBe(22050);
    expect(view.getUint16(34, true)).toBe(8);
    expect(view.getUint32(40, true)).toBe(Math.round(renderSound(SOUND).length / 2));
    expect(soundToWav(SOUND, { sampleRate: 48000, bitDepth: 16 }).length).toBe(44 + Math.round((renderSound(SOUND).length * 48000) / 44100) * 2);
  });
});

describe("soundsToZip", () => {
  it("names one WAV per sound, unique and safe", () => {
    const zip = soundsToZip(
      [
        { name: "Jump", params: SOUND },
        { name: "Jump", params: SOUND },
        { name: "a/b: c?", params: SOUND },
      ],
      { sampleRate: 44100, bitDepth: 16 }
    );
    const text = new TextDecoder().decode(zip);
    expect(text).toContain("Jump.wav");
    expect(text).toContain("Jump (2).wav");
    expect(text).toContain("a-b- c-.wav");
    expect(text.split("RIFF").length - 1).toBe(3);
  });
});

describe("safeFileName", () => {
  it("falls back when nothing is left", () => {
    expect(safeFileName(" .. ")).toBe("sound");
    expect(safeFileName("Boom!")).toBe("Boom!");
  });
});
