/**
 * Small store-only ZIP writer (no compression): enough to bundle WAVs, which barely compress anyway.
 * File names are written as UTF-8 (general purpose flag bit 11).
 */

export interface ZipFile {
  name: string;
  data: Uint8Array;
}

const UTF8_FLAG = 0x0800;
const VERSION = 20;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** MS-DOS time and date, the only timestamps a plain ZIP entry has. */
function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

/** Makes names unique inside the zip: a second "Jump.wav" becomes "Jump (2).wav". */
export function uniqueNames(names: string[]): string[] {
  const used = new Set<string>();
  return names.map((name) => {
    const dot = name.lastIndexOf(".");
    const [stem, extension] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
    let candidate = name;
    for (let n = 2; used.has(candidate.toLowerCase()); n++) candidate = `${stem} (${n})${extension}`;
    used.add(candidate.toLowerCase());
    return candidate;
  });
}

export function createZip(files: ZipFile[], modified: Date = new Date()): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const stamp = dosDateTime(modified);
  const entries = files.map((file) => ({ ...file, nameBytes: encoder.encode(file.name), crc: crc32(file.data) }));
  const localSize = entries.reduce((sum, e) => sum + 30 + e.nameBytes.length + e.data.length, 0);
  const centralSize = entries.reduce((sum, e) => sum + 46 + e.nameBytes.length, 0);
  const out = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(out.buffer);
  let offset = 0;

  const writeEntryFields = (e: (typeof entries)[number]) => {
    view.setUint16(offset, UTF8_FLAG, true);
    view.setUint16(offset + 2, 0, true);
    view.setUint16(offset + 4, stamp.time, true);
    view.setUint16(offset + 6, stamp.date, true);
    view.setUint32(offset + 8, e.crc, true);
    view.setUint32(offset + 12, e.data.length, true);
    view.setUint32(offset + 16, e.data.length, true);
    view.setUint16(offset + 20, e.nameBytes.length, true);
    view.setUint16(offset + 22, 0, true);
    offset += 24;
  };

  const localOffsets = entries.map((e) => {
    const start = offset;
    view.setUint32(offset, 0x04034b50, true);
    view.setUint16(offset + 4, VERSION, true);
    offset += 6;
    writeEntryFields(e);
    out.set(e.nameBytes, offset);
    out.set(e.data, offset + e.nameBytes.length);
    offset += e.nameBytes.length + e.data.length;
    return start;
  });

  const centralStart = offset;
  entries.forEach((e, i) => {
    view.setUint32(offset, 0x02014b50, true);
    view.setUint16(offset + 4, VERSION, true);
    view.setUint16(offset + 6, VERSION, true);
    offset += 8;
    writeEntryFields(e);
    // comment length, disk number, internal and external attributes: all zero
    view.setUint32(offset + 10, localOffsets[i], true);
    offset += 14;
    out.set(e.nameBytes, offset);
    offset += e.nameBytes.length;
  });

  view.setUint32(offset, 0x06054b50, true);
  view.setUint16(offset + 8, entries.length, true);
  view.setUint16(offset + 10, entries.length, true);
  view.setUint32(offset + 12, offset - centralStart, true);
  view.setUint32(offset + 16, centralStart, true);
  return out;
}
