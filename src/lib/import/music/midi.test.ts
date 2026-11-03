import { describe, expect, it } from "vitest";
import { runImporter } from "@/lib/import";
import { midiImporter } from "./midi";
import { parseMidiFile } from "./midi-file";

// Hand-built Standard MIDI files. An event is [delta ticks, ...bytes].
type Event = [number, ...number[]];

function variableLength(value: number): number[] {
  const bytes = [value & 0x7f];
  for (let rest = value >> 7; rest > 0; rest >>= 7) bytes.unshift((rest & 0x7f) | 0x80);
  return bytes;
}

const uint = (value: number, length: number) => Array.from({ length }, (_, i) => (value >> (8 * (length - 1 - i))) & 0xff);
const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0));
const chunk = (type: string, data: number[]) => [...ascii(type), ...uint(data.length, 4), ...data];
const name = (text: string): Event => [0, 0xff, 0x03, text.length, ...ascii(text)];
const tempo = (delta: number, bpm: number): Event => [delta, 0xff, 0x51, 3, ...uint(Math.round(60_000_000 / bpm), 3)];
const endOfTrack: Event = [0, 0xff, 0x2f, 0];

function track(events: Event[]): number[] {
  return chunk("MTrk", events.flatMap(([delta, ...bytes]) => [...variableLength(delta), ...bytes]));
}

function midiBytes(format: number, tracks: number[][], ticksPerBeat = 96): Uint8Array<ArrayBuffer> {
  return new Uint8Array([...chunk("MThd", [...uint(format, 2), ...uint(tracks.length, 2), ...uint(ticksPerBeat, 2)]), ...tracks.flat()]);
}

const midiFile = (bytes: Uint8Array<ArrayBuffer>, fileName = "song.mid") => new File([bytes], fileName, { type: "audio/midi" });

async function importSong(bytes: Uint8Array<ArrayBuffer>) {
  const outcome = await runImporter(midiImporter, midiFile(bytes));
  if (!outcome.ok) throw new Error(outcome.message);
  return { song: outcome.result.items[0], warnings: outcome.result.warnings };
}

describe("MIDI parser", () => {
  it("reads notes with running status and note-on velocity 0 as note-off", () => {
    // C4 for one beat, then (running status) E4 for half a beat, released by velocity 0
    const bytes = midiBytes(0, [track([[0, 0x90, 60, 100], [96, 0x80, 60, 0], [0, 0x90, 64, 80], [48, 64, 0], endOfTrack])]);
    const midi = parseMidiFile(bytes);
    expect(midi.tracks[0].notes).toEqual([
      { channel: 0, pitch: 60, velocity: 100, startTick: 0, durationTicks: 96 },
      { channel: 0, pitch: 64, velocity: 80, startTick: 96, durationTicks: 48 },
    ]);
  });

  it("decodes multi-byte delta times", () => {
    const bytes = midiBytes(0, [track([[200, 0x90, 60, 100], [300, 0x80, 60, 0], endOfTrack])], 100);
    expect(parseMidiFile(bytes).tracks[0].notes[0]).toMatchObject({ startTick: 200, durationTicks: 300 });
  });

  it("rejects other files, format 2, SMPTE time and cut-off files", () => {
    expect(() => parseMidiFile(new Uint8Array(ascii("RIFF0000WAVEfmt ")))).toThrow("isn't a MIDI file");
    expect(() => parseMidiFile(midiBytes(2, [track([endOfTrack])]))).toThrow("format 2");
    expect(() => parseMidiFile(midiBytes(0, [track([endOfTrack])], 0xe728))).toThrow("SMPTE");
    expect(() => parseMidiFile(midiBytes(0, [track([[0, 0x90, 60, 100], endOfTrack])]).slice(0, -6))).toThrow("damaged");
  });
});

describe("MIDI import", () => {
  it("turns a format 1 file into melody, bass and drums at the first tempo", async () => {
    const bytes = midiBytes(1, [
      track([name("Castle theme"), tempo(0, 150), endOfTrack]),
      track([name("Lead"), [0, 0x90, 72, 127], [96, 0x80, 72, 0], [0, 0x90, 74, 64], [48, 0x80, 74, 0], endOfTrack]),
      track([name("Low"), [0, 0x91, 48, 100], [192, 0x81, 48, 0], endOfTrack]),
      track([[0, 0x99, 36, 127], [24, 0x89, 36, 0], [72, 0x99, 42, 90], [24, 0x89, 42, 0], endOfTrack]),
    ]);
    const { song, warnings } = await importSong(bytes);
    expect(warnings).toEqual([]);
    expect(song.name).toBe("Castle theme");
    expect(song.bpm).toBe(150);
    expect(song.channels.map((channel) => channel.name)).toEqual(["Melody", "Harmony", "Bass", "Drums"]);
    const notes = song.channels.map((channel) => channel.patterns[0].notes);
    expect(notes[0]).toEqual([
      { pitch: 72, start: 0, duration: 1, velocity: 1 },
      { pitch: 74, start: 1, duration: 0.5, velocity: 0.5 },
    ]);
    expect(notes[1]).toEqual([]);
    expect(notes[2]).toEqual([{ pitch: 48, start: 0, duration: 2, velocity: 0.79 }]);
    expect(notes[3].map((note) => [note.pitch, note.start, note.duration])).toEqual([[48, 0, 0.25], [84, 1, 0.25]]);
  });

  it("splits a format 0 file by channel and names the song after the file", async () => {
    const bytes = midiBytes(0, [track([[0, 0x90, 76, 100], [0, 0x92, 60, 100], [0, 0x91, 52, 100], [96, 0x80, 76, 0], [0, 0x82, 60, 0], [0, 0x81, 52, 0], endOfTrack])]);
    const { song } = await importSong(bytes);
    expect(song.name).toBe("song");
    expect(song.bpm).toBe(120);
    expect(song.channels.slice(0, 3).map((channel) => channel.patterns[0].notes.map((note) => note.pitch))).toEqual([[76], [60], [52]]);
  });

  it("warns about tempo changes, extra parts, out-of-range notes and notes past 32 beats", async () => {
    const part = (channel: number, pitch: number, count: number): number[] =>
      track([...Array.from({ length: count }, (_, i): Event[] => [[i === 0 ? 0 : 0, 0x90 | channel, pitch, 100], [96, 0x80 | channel, pitch, 0]]).flat(), endOfTrack]);
    const bytes = midiBytes(1, [
      track([tempo(0, 240), tempo(96, 100), endOfTrack]),
      part(0, 96, 40),
      part(1, 60, 3),
      part(2, 50, 2),
      part(3, 40, 1),
    ]);
    const { song, warnings } = await importSong(bytes);
    expect(song.bpm).toBe(200);
    expect(warnings).toEqual([
      "The song changes tempo 1 time; the whole song plays at its first tempo.",
      "Its tempo (240 BPM) is outside 60–200 BPM, so it was set to 200 BPM.",
      "Left out 1 part (Track 5, 1 note): the composer has three melodic channels plus drums.",
      "Moved 32 notes by whole octaves into the composer's range (C3–C6).",
      "The song is 40 beats long; kept the first 32 beats, the longest loop, and left out 8 notes.",
    ]);
    expect(song.channels[0].patterns[0].notes).toHaveLength(32);
    expect(song.channels[0].patterns[0].notes[0].pitch).toBe(84);
  });

  it("refuses files without notes and files over the size limit", async () => {
    expect(await runImporter(midiImporter, midiFile(midiBytes(1, [track([tempo(0, 120), endOfTrack])])))).toEqual({ ok: false, message: "This MIDI file has no notes." });
    const huge = new File([new Uint8Array(2 * 1024 * 1024 + 1)], "huge.mid");
    expect(await runImporter(midiImporter, huge)).toEqual({ ok: false, message: expect.stringContaining("is too big") });
  });
});
