import type { MusicChannel, MusicTrack } from "@/types";
import { getSections, sectionNotes, songSteps } from "@/lib/music-sections";

const TICKS_PER_BEAT = 480;
const DRUM_CHANNEL = 9;
const END_OF_TRACK = [0xff, 0x2f, 0x00];

/** General MIDI programs that roughly match each waveform: Lead 1 (square), Lead 2 (sawtooth), Flute, Sine-ish pad. */
const PROGRAMS: Record<string, number> = { square: 80, sawtooth: 81, triangle: 73, sine: 88 };
const DEFAULT_PROGRAM = 80;

/** One General MIDI drum key per noise pitch band; the importer's `drumPitch` maps each back to the same band. */
const DRUM_KEYS: { upTo: number; key: number }[] = [
  { upTo: 52, key: 36 },
  { upTo: 60, key: 47 },
  { upTo: 68, key: 38 },
  { upTo: 76, key: 54 },
  { upTo: 82, key: 49 },
  { upTo: Infinity, key: 42 },
];

interface TimedEvent {
  tick: number;
  order: number;
  bytes: number[];
}

const isDrumChannel = (channel: MusicChannel) => channel.instrument === "noise";

function drumKey(pitch: number): number {
  return DRUM_KEYS.find((band) => pitch <= band.upTo)?.key ?? 42;
}

function variableLength(value: number): number[] {
  const bytes = [value & 0x7f];
  for (let rest = value >> 7; rest > 0; rest >>= 7) bytes.unshift((rest & 0x7f) | 0x80);
  return bytes;
}

function uint32(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function uint16(value: number): number[] {
  return [(value >> 8) & 0xff, value & 0xff];
}

function metaText(type: number, text: string): number[] {
  const bytes = [...new TextEncoder().encode(text)];
  return [0xff, type, ...variableLength(bytes.length), ...bytes];
}

function chunk(tag: string, body: number[]): number[] {
  return [...[...tag].map((letter) => letter.charCodeAt(0)), ...uint32(body.length), ...body];
}

function encodeTrack(name: string, events: TimedEvent[]): number[] {
  const body = [...variableLength(0), ...metaText(0x03, name)];
  let previousTick = 0;
  for (const event of [...events].sort((a, b) => a.tick - b.tick || a.order - b.order)) {
    body.push(...variableLength(event.tick - previousTick), ...event.bytes);
    previousTick = event.tick;
  }
  body.push(...variableLength(0), ...END_OF_TRACK);
  return chunk("MTrk", body);
}

function tempoTrack(track: MusicTrack): number[] {
  const microsecondsPerBeat = Math.round(60_000_000 / track.bpm);
  const tempo = [0xff, 0x51, 0x03, ...uint32(microsecondsPerBeat).slice(1)];
  const fourFour = [0xff, 0x58, 0x04, 4, 2, 24, 8];
  return encodeTrack(track.name, [
    { tick: 0, order: 0, bytes: tempo },
    { tick: 0, order: 1, bytes: fourFour },
  ]);
}

/** Every note the channel plays in Song mode (intro, then one pass of the loop, repeats expanded), in ticks. */
function songNoteEvents(track: MusicTrack, channel: MusicChannel, midiChannel: number): TimedEvent[] {
  const sections = getSections(track);
  const events: TimedEvent[] = [];
  let stepStartBeat = 0;
  for (const step of songSteps(track, "song", "").steps) {
    const section = sections.find((candidate) => candidate.id === step.sectionId);
    if (section) events.push(...sectionNoteEvents(track, channel, midiChannel, section, stepStartBeat));
    stepStartBeat += step.length;
  }
  return events;
}

function sectionNoteEvents(track: MusicTrack, channel: MusicChannel, midiChannel: number, section: ReturnType<typeof getSections>[number], startBeat: number): TimedEvent[] {
  return sectionNotes(track, section, channel.id).flatMap((note) => {
    const key = isDrumChannel(channel) ? drumKey(note.pitch) : note.pitch;
    const startTick = Math.round((startBeat + note.start) * TICKS_PER_BEAT);
    const endTick = startTick + Math.max(1, Math.round(note.duration * TICKS_PER_BEAT));
    const velocity = Math.min(127, Math.max(1, Math.round(note.velocity * 127)));
    return [
      { tick: startTick, order: 2, bytes: [0x90 | midiChannel, key, velocity] },
      { tick: endTick, order: 1, bytes: [0x80 | midiChannel, key, 0] },
    ];
  });
}

function channelTrack(track: MusicTrack, channel: MusicChannel, midiChannel: number): number[] {
  const program: TimedEvent = { tick: 0, order: 0, bytes: [0xc0 | midiChannel, PROGRAMS[channel.instrument] ?? DEFAULT_PROGRAM] };
  const events = songNoteEvents(track, channel, midiChannel);
  return encodeTrack(channel.name, isDrumChannel(channel) ? events : [program, ...events]);
}

/** MIDI channels for the melodic voices in order, skipping the drum channel. */
function melodicMidiChannel(index: number): number {
  return index < DRUM_CHANNEL ? index : index + 1;
}

/** A format 1 Standard MIDI File of the song as Song mode plays it once: a tempo track, then one named track per channel. */
export function writeMidiFile(track: MusicTrack): Uint8Array {
  let melodicCount = 0;
  const channelTracks = track.channels.map((channel) => channelTrack(track, channel, isDrumChannel(channel) ? DRUM_CHANNEL : melodicMidiChannel(melodicCount++)));
  const header = chunk("MThd", [...uint16(1), ...uint16(track.channels.length + 1), ...uint16(TICKS_PER_BEAT)]);
  return new Uint8Array([...header, ...tempoTrack(track), ...channelTracks.flat()]);
}
