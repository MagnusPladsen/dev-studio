import { v4 as uuid } from "uuid";
import type { MusicChannel, MusicNote, MusicTrack } from "@/types";
import { ImportError, type Importer } from "@/lib/import/types";
import { assertFileSize } from "@/lib/import/file-size";
import { parseMidiFile, type MidiFile, type MidiNote } from "./midi-file";

const MAX_BYTES = 2 * 1024 * 1024;
/** What the Music composer can show and play: C3–C6, a loop of up to 32 beats, 60–200 BPM. */
const MIN_PITCH = 48;
const MAX_PITCH = 84;
const MAX_BEATS = 32;
const BPM_RANGE = { min: 60, max: 200 };
const DRUM_CHANNEL = 9;
const MELODIC_SLOTS = 3;

interface Part {
  name: string;
  notes: MidiNote[];
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
const round = (value: number) => Math.round(value * 1000) / 1000;

/** General MIDI drum keys as a noise pitch: kicks low, snares in the middle, hats and cymbals high. */
function drumPitch(key: number): number {
  if (key <= 36) return 48;
  if (key <= 40) return 64;
  if ([42, 44, 46].includes(key)) return 84;
  if ([49, 51, 52, 53, 55, 57, 59].includes(key)) return 80;
  if (key <= 50) return 56;
  return 72;
}

function intoRange(pitch: number): number {
  let shifted = pitch;
  while (shifted < MIN_PITCH) shifted += 12;
  while (shifted > MAX_PITCH) shifted -= 12;
  return shifted;
}

/** Format 1 files keep one part per track; format 0 (and tracks that mix channels) split by channel. */
function splitIntoParts(midi: MidiFile): { melodic: Part[]; drums: MidiNote[] } {
  const melodic: Part[] = [];
  const drums: MidiNote[] = [];
  midi.tracks.forEach((track, index) => {
    const channels = [...new Set(track.notes.map((note) => note.channel))].filter((channel) => channel !== DRUM_CHANNEL);
    drums.push(...track.notes.filter((note) => note.channel === DRUM_CHANNEL));
    for (const channel of channels) {
      const base = track.name || `Track ${index + 1}`;
      melodic.push({ name: channels.length > 1 ? `${base} (channel ${channel + 1})` : base, notes: track.notes.filter((note) => note.channel === channel) });
    }
  });
  return { melodic, drums };
}

const averagePitch = (part: Part) => part.notes.reduce((sum, note) => sum + note.pitch, 0) / part.notes.length;

/** Keeps the three busiest parts, highest on Melody and lowest on Bass. Two parts become Melody and Bass. */
function assignSlots(parts: Part[]): { slots: (Part | null)[]; dropped: Part[] } {
  const kept = [...parts].sort((a, b) => b.notes.length - a.notes.length).slice(0, MELODIC_SLOTS);
  const dropped = parts.filter((part) => !kept.includes(part));
  const byPitch = kept.sort((a, b) => averagePitch(b) - averagePitch(a));
  const slots: (Part | null)[] = [null, null, null];
  if (byPitch.length === 2) [slots[0], slots[2]] = byPitch;
  else byPitch.forEach((part, index) => (slots[index] = part));
  return { slots, dropped };
}

interface Conversion {
  ticksPerBeat: number;
  cut: { notes: number; endBeat: number };
  shifted: { notes: number };
}

function toNotes(notes: MidiNote[], mapPitch: (pitch: number) => number, conversion: Conversion): MusicNote[] {
  const result: MusicNote[] = [];
  for (const note of notes) {
    const start = note.startTick / conversion.ticksPerBeat;
    const end = (note.startTick + note.durationTicks) / conversion.ticksPerBeat;
    conversion.cut.endBeat = Math.max(conversion.cut.endBeat, end);
    if (start >= MAX_BEATS) {
      conversion.cut.notes++;
      continue;
    }
    const pitch = mapPitch(note.pitch);
    if (pitch !== note.pitch) conversion.shifted.notes++;
    const duration = Math.max(0.05, Math.min(end, MAX_BEATS) - start);
    result.push({ pitch, start: round(start), duration: round(duration), velocity: Math.round((note.velocity / 127) * 100) / 100 });
  }
  return result;
}

function channel(name: string, instrument: string, notes: MusicNote[]): MusicChannel {
  return { id: uuid(), name, instrument, volume: 0.5, patterns: [{ id: uuid(), notes }] };
}

function readTempo(midi: MidiFile, warnings: string[]): number {
  const [first] = midi.tempos;
  const bpm = first ? Math.round(60_000_000 / first.microsecondsPerBeat) : 120;
  const changes = midi.tempos.filter((tempo) => tempo.microsecondsPerBeat !== first?.microsecondsPerBeat).length;
  if (changes) warnings.push(`The song changes tempo ${plural(changes, "time", "times")}; the whole song plays at its first tempo.`);
  const clamped = Math.min(BPM_RANGE.max, Math.max(BPM_RANGE.min, bpm));
  if (clamped !== bpm) warnings.push(`Its tempo (${bpm} BPM) is outside 60–200 BPM, so it was set to ${clamped} BPM.`);
  return clamped;
}

function fileStem(name: string): string {
  return name.replace(/\.[^.]+$/, "") || "Imported song";
}

/** Turns a parsed MIDI file into a song: three melodic channels plus drums from channel 10. */
export function midiToSong(midi: MidiFile, fileName: string): { song: MusicTrack; warnings: string[] } {
  const warnings: string[] = [];
  const bpm = readTempo(midi, warnings);
  const { melodic, drums } = splitIntoParts(midi);
  if (melodic.length === 0 && drums.length === 0) throw new ImportError("This MIDI file has no notes.");
  const { slots, dropped } = assignSlots(melodic);
  const conversion: Conversion = { ticksPerBeat: midi.ticksPerBeat, cut: { notes: 0, endBeat: 0 }, shifted: { notes: 0 } };
  const [melody, harmony, bass] = slots.map((part) => toNotes(part?.notes ?? [], intoRange, conversion));
  const drumNotes = toNotes(drums, drumPitch, { ...conversion, shifted: { notes: 0 } });

  if (dropped.length) {
    const lost = dropped.reduce((sum, part) => sum + part.notes.length, 0);
    warnings.push(`Left out ${plural(dropped.length, "part", "parts")} (${dropped.map((part) => part.name).join(", ")}, ${plural(lost, "note", "notes")}): the composer has three melodic channels plus drums.`);
  }
  if (conversion.shifted.notes) warnings.push(`Moved ${plural(conversion.shifted.notes, "note", "notes")} by whole octaves into the composer's range (C3–C6).`);
  if (conversion.cut.notes) warnings.push(`The song is ${Math.ceil(conversion.cut.endBeat)} beats long; kept the first ${MAX_BEATS} beats, the longest loop, and left out ${plural(conversion.cut.notes, "note", "notes")}.`);
  if (midi.unterminatedNotes) warnings.push(`${plural(midi.unterminatedNotes, "note was", "notes were")} never released; they end with their track.`);

  const now = new Date().toISOString();
  const name = midi.format === 1 && midi.tracks[0]?.name && midi.tracks[0].notes.length === 0 ? midi.tracks[0].name : fileStem(fileName);
  const song: MusicTrack = {
    id: uuid(),
    projectId: "",
    name,
    bpm,
    channels: [channel("Melody", "square", melody), channel("Harmony", "triangle", harmony), channel("Bass", "sawtooth", bass), channel("Drums", "noise", drumNotes)],
    tags: [],
    createdAt: now,
    updatedAt: now,
  };
  return { song, warnings };
}

/** Standard MIDI files (format 0 and 1) as a new song. */
export const midiImporter: Importer<MusicTrack> = {
  id: "midi",
  label: "MIDI file (.mid)",
  description: "Notes, tempo and drums (channel 10) as a new song",
  accept: [".mid", ".midi", "audio/midi", "audio/mid", "audio/x-midi"],
  async parse(file) {
    assertFileSize(file, MAX_BYTES);
    const { song, warnings } = midiToSong(parseMidiFile(new Uint8Array(await file.arrayBuffer())), file.name);
    return { items: [song], warnings };
  },
};
