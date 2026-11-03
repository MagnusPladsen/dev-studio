import { ImportError } from "@/lib/import/types";

/** One note from a Standard MIDI File, in ticks. `channel` is 0-based, so the General MIDI drum channel is 9. */
export interface MidiNote {
  channel: number;
  pitch: number;
  velocity: number;
  startTick: number;
  durationTicks: number;
}

export interface MidiTrack {
  name: string;
  notes: MidiNote[];
}

export interface MidiFile {
  format: number;
  /** Ticks per quarter note (PPQ). */
  ticksPerBeat: number;
  tracks: MidiTrack[];
  /** Tempo changes across all tracks, sorted by tick. */
  tempos: { tick: number; microsecondsPerBeat: number }[];
  /** Notes that were never released; they end where their track ends. */
  unterminatedNotes: number;
}

const DAMAGED = "This MIDI file is damaged: it ends in the middle of the data.";

/** Reads big-endian numbers, MIDI variable-length numbers and strings, throwing `ImportError` past the end. */
class ByteReader {
  constructor(private bytes: Uint8Array, public position = 0) {}

  get isAtEnd() {
    return this.position >= this.bytes.length;
  }

  byte(): number {
    if (this.position >= this.bytes.length) throw new ImportError(DAMAGED);
    return this.bytes[this.position++];
  }

  uint(length: number): number {
    let value = 0;
    for (let i = 0; i < length; i++) value = value * 256 + this.byte();
    return value;
  }

  variableLength(): number {
    let value = 0;
    for (let i = 0; i < 4; i++) {
      const byte = this.byte();
      value = value * 128 + (byte & 0x7f);
      if (!(byte & 0x80)) return value;
    }
    throw new ImportError("This MIDI file is damaged: a time value is too long.");
  }

  text(length: number): string {
    return String.fromCharCode(...this.slice(length));
  }

  slice(length: number): Uint8Array {
    if (this.position + length > this.bytes.length) throw new ImportError(DAMAGED);
    const part = this.bytes.subarray(this.position, this.position + length);
    this.position += length;
    return part;
  }
}

const DATA_BYTES: Record<number, number> = { 0x80: 2, 0x90: 2, 0xa0: 2, 0xb0: 2, 0xc0: 1, 0xd0: 1, 0xe0: 2 };

interface TrackParse {
  track: MidiTrack;
  tempos: MidiFile["tempos"];
  unterminatedNotes: number;
}

function readTrack(reader: ByteReader): TrackParse {
  const track: MidiTrack = { name: "", notes: [] };
  const tempos: MidiFile["tempos"] = [];
  // per channel + pitch, the notes still sounding (first in, first out)
  const sounding = new Map<number, MidiNote[]>();
  let tick = 0;
  let runningStatus = 0;

  const release = (channel: number, pitch: number) => {
    const note = sounding.get(channel * 128 + pitch)?.shift();
    if (note) note.durationTicks = tick - note.startTick;
  };

  while (!reader.isAtEnd) {
    tick += reader.variableLength();
    let status = reader.byte();
    if (status === 0xff) {
      const type = reader.byte();
      const data = reader.slice(reader.variableLength());
      if (type === 0x2f) break;
      if (type === 0x03 && !track.name) track.name = String.fromCharCode(...data.subarray(0, 100)).trim();
      if (type === 0x51 && data.length === 3) tempos.push({ tick, microsecondsPerBeat: (data[0] << 16) | (data[1] << 8) | data[2] });
      continue;
    }
    if (status === 0xf0 || status === 0xf7) {
      reader.slice(reader.variableLength());
      continue;
    }
    let firstData: number;
    if (status < 0x80) {
      if (!runningStatus) throw new ImportError("This MIDI file is damaged: an event has no status byte.");
      firstData = status;
      status = runningStatus;
    } else {
      runningStatus = status;
      firstData = reader.byte();
    }
    const kind = status & 0xf0;
    const channel = status & 0x0f;
    const secondData = DATA_BYTES[kind] === 2 ? reader.byte() : 0;
    if (kind === 0x80 || (kind === 0x90 && secondData === 0)) release(channel, firstData);
    else if (kind === 0x90) {
      const note: MidiNote = { channel, pitch: firstData, velocity: secondData, startTick: tick, durationTicks: -1 };
      track.notes.push(note);
      const key = channel * 128 + firstData;
      sounding.set(key, [...(sounding.get(key) ?? []), note]);
    }
  }

  let unterminatedNotes = 0;
  for (const note of track.notes) {
    if (note.durationTicks >= 0) continue;
    note.durationTicks = tick - note.startTick;
    unterminatedNotes++;
  }
  return { track, tempos, unterminatedNotes };
}

/** Parses a Standard MIDI File (format 0 or 1) into notes per track. Throws `ImportError` for anything else. */
export function parseMidiFile(bytes: Uint8Array): MidiFile {
  const reader = new ByteReader(bytes);
  if (bytes.length < 14 || reader.text(4) !== "MThd") throw new ImportError("This isn't a MIDI file. Pick a .mid or .midi file.");
  const headerLength = reader.uint(4);
  const format = reader.uint(2);
  const trackCount = reader.uint(2);
  const division = reader.uint(2);
  reader.slice(Math.max(0, headerLength - 6));
  if (format > 1) throw new ImportError("This is a format 2 MIDI file (separate patterns). Only format 0 and 1 files can be imported.");
  if (division & 0x8000 || division === 0) throw new ImportError("This MIDI file counts time in SMPTE frames. Only files that count beats can be imported.");

  const file: MidiFile = { format, ticksPerBeat: division, tracks: [], tempos: [], unterminatedNotes: 0 };
  while (!reader.isAtEnd && file.tracks.length < trackCount) {
    const type = reader.text(4);
    const length = reader.uint(4);
    const chunk = reader.slice(length);
    if (type !== "MTrk") continue;
    const parsed = readTrack(new ByteReader(chunk));
    file.tracks.push(parsed.track);
    file.tempos.push(...parsed.tempos);
    file.unterminatedNotes += parsed.unterminatedNotes;
  }
  file.tempos.sort((a, b) => a.tick - b.tick);
  return file;
}
