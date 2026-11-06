import { describe, expect, it } from "vitest";
import { encodeWav, resample } from "./wav";

const text = (view: DataView, offset: number, length: number) =>
  String.fromCharCode(...Array.from({ length }, (_, i) => view.getUint8(offset + i)));

describe("encodeWav", () => {
  it("writes a mono 16-bit PCM header", () => {
    const view = new DataView(encodeWav(new Float32Array(10), 44100));
    expect(view.byteLength).toBe(44 + 20);
    expect(text(view, 0, 4)).toBe("RIFF");
    expect(view.getUint32(4, true)).toBe(36 + 20);
    expect(text(view, 8, 8)).toBe("WAVEfmt ");
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(44100);
    expect(view.getUint16(34, true)).toBe(16);
    expect(text(view, 36, 4)).toBe("data");
    expect(view.getUint32(40, true)).toBe(20);
  });

  it("scales samples to 16 bits and clips loud ones", () => {
    const view = new DataView(encodeWav(new Float32Array([0, 1, -1, 2, -2, 0.5]), 8000));
    const values = Array.from({ length: 6 }, (_, i) => view.getInt16(44 + i * 2, true));
    expect(values).toEqual([0, 32767, -32768, 32767, -32768, 16383]);
  });
});

describe("encodeWav bit depths and rates", () => {
  it.each([22050, 44100, 48000])("writes %i Hz into the header and byte rate", (rate) => {
    const view = new DataView(encodeWav(new Float32Array(4), rate, 8));
    expect(view.getUint32(24, true)).toBe(rate);
    expect(view.getUint32(28, true)).toBe(rate);
    const view16 = new DataView(encodeWav(new Float32Array(4), rate));
    expect(view16.getUint32(28, true)).toBe(rate * 2);
  });

  it("writes 8-bit unsigned samples centred on 128", () => {
    const view = new DataView(encodeWav(new Float32Array([0, 1, -1, 2, -2, 0.5]), 22050, 8));
    expect(view.byteLength).toBe(44 + 6);
    expect(view.getUint32(4, true)).toBe(36 + 6);
    expect(view.getUint16(32, true)).toBe(1);
    expect(view.getUint16(34, true)).toBe(8);
    expect(view.getUint32(40, true)).toBe(6);
    expect(Array.from({ length: 6 }, (_, i) => view.getUint8(44 + i))).toEqual([128, 255, 1, 255, 1, 192]);
  });
});

describe("resample", () => {
  it("keeps the length in seconds", () => {
    const second = new Float32Array(44100).fill(0.5);
    expect(resample(second, 44100, 22050).length).toBe(22050);
    expect(resample(second, 44100, 48000).length).toBe(48000);
    expect(resample(second, 44100, 48000).every((sample) => Math.abs(sample - 0.5) < 1e-6)).toBe(true);
  });

  it("returns the same samples when the rate doesn't change", () => {
    const samples = new Float32Array([0.1, 0.2]);
    expect(resample(samples, 44100, 44100)).toBe(samples);
  });

  it("interpolates between neighbours", () => {
    expect(Array.from(resample(new Float32Array([0, 1, 0, -1]), 2, 4))).toEqual([0, 0.5, 1, 0.5, 0, -0.5, -1, -1]);
  });
});
