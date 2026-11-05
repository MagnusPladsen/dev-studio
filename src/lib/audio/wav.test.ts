import { describe, expect, it } from "vitest";
import { encodeWav } from "./wav";

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
