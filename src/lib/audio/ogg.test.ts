import { describe, expect, it } from "vitest";
import { encodeOgg } from "./ogg";

const SAMPLE_RATE = 44100;

function sine(frequency: number, seconds: number): Float32Array {
  const samples = new Float32Array(Math.round(SAMPLE_RATE * seconds));
  for (let index = 0; index < samples.length; index++) {
    samples[index] = 0.5 * Math.sin((2 * Math.PI * frequency * index) / SAMPLE_RATE);
  }
  return samples;
}

function containsText(bytes: Uint8Array, text: string): boolean {
  return new TextDecoder("latin1").decode(bytes).includes(text);
}

describe("encodeOgg", () => {
  it("encodes one second of a 440 Hz sine as Ogg Vorbis", async () => {
    const bytes = await encodeOgg(sine(440, 1), SAMPLE_RATE);
    expect(new TextDecoder().decode(bytes.subarray(0, 4))).toBe("OggS");
    expect(containsText(bytes, "vorbis")).toBe(true);
    expect(bytes.length).toBeGreaterThan(1000);
  });

  it("encodes silence without failing", async () => {
    const bytes = await encodeOgg(new Float32Array(SAMPLE_RATE), SAMPLE_RATE);
    expect(new TextDecoder().decode(bytes.subarray(0, 4))).toBe("OggS");
  });
});
