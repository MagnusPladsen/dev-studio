import { describe, expect, it } from "vitest";
import { crc32, createZip, uniqueNames } from "./zip";

interface Entry {
  name: string;
  crc: number;
  size: number;
  data: Uint8Array;
}

/** Reads a zip the way unzip tools do: end record → central directory → local headers. */
function readZip(zip: Uint8Array): Entry[] {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const end = zip.length - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  expect(offset + view.getUint32(end + 12, true)).toBe(end);
  const entries: Entry[] = [];
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(offset, true)).toBe(0x02014b50);
    expect(view.getUint16(offset + 10, true)).toBe(0);
    const crc = view.getUint32(offset + 16, true);
    const size = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const local = view.getUint32(offset + 42, true);
    const name = new TextDecoder().decode(zip.subarray(offset + 46, offset + 46 + nameLength));
    expect(view.getUint32(local, true)).toBe(0x04034b50);
    expect(view.getUint32(local + 14, true)).toBe(crc);
    const dataStart = local + 30 + view.getUint16(local + 26, true);
    entries.push({ name, crc, size, data: zip.subarray(dataStart, dataStart + size) });
    offset += 46 + nameLength;
  }
  return entries;
}

describe("crc32", () => {
  it("matches the standard check value", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });
});

describe("createZip", () => {
  it("stores each file with its name, size and checksum", () => {
    const files = [
      { name: "jump.wav", data: new Uint8Array([1, 2, 3]) },
      { name: "lyd ø.wav", data: new Uint8Array(0) },
      { name: "coin.wav", data: new Uint8Array(1000).fill(7) },
    ];
    const entries = readZip(createZip(files, new Date(2026, 10, 5, 12, 30, 10)));
    expect(entries.map((e) => e.name)).toEqual(["jump.wav", "lyd ø.wav", "coin.wav"]);
    entries.forEach((entry, i) => {
      expect(entry.size).toBe(files[i].data.length);
      expect(entry.crc).toBe(crc32(files[i].data));
      expect(Array.from(entry.data)).toEqual(Array.from(files[i].data));
    });
  });

  it("writes an empty zip as just the end record", () => {
    const zip = createZip([]);
    expect(zip.length).toBe(22);
    expect(readZip(zip)).toEqual([]);
  });
});

describe("uniqueNames", () => {
  it("numbers repeated names, ignoring case", () => {
    expect(uniqueNames(["Jump.wav", "jump.wav", "Jump.wav", "Coin"])).toEqual(["Jump.wav", "jump (2).wav", "Jump (3).wav", "Coin"]);
  });
});
