import { describe, expect, it } from "vitest";
import type { MusicChannel, MusicNote, MusicTrack } from "@/types";
import { parseMidiFile } from "./midi-file";
import { midiToSong } from "./midi";
import { writeMidiFile } from "./midi-write";

const note = (pitch: number, start: number, duration = 1, velocity = 1): MusicNote => ({ pitch, start, duration, velocity });

function channel(id: string, instrument: string, notes: MusicNote[]): MusicChannel {
  return { id, name: id, instrument, volume: 1, patterns: [{ id: `${id}-p`, notes }] };
}

function song(channels: MusicChannel[], overrides: Partial<MusicTrack> = {}): MusicTrack {
  return { id: "s", projectId: "p", name: "Test song", bpm: 90, channels, tags: [], createdAt: "", updatedAt: "", ...overrides };
}

const roundTrip = (track: MusicTrack) => parseMidiFile(writeMidiFile(track));

describe("writeMidiFile", () => {
  it("writes format 1 at 480 ticks per beat with a tempo track plus one named track per channel", () => {
    const midi = roundTrip(song([channel("Lead", "square", [note(60, 0)]), channel("Drums", "noise", [note(48, 0)])]));
    expect(midi.format).toBe(1);
    expect(midi.ticksPerBeat).toBe(480);
    expect(midi.tracks.map((t) => t.name)).toEqual(["Test song", "Lead", "Drums"]);
    expect(midi.tempos).toEqual([{ tick: 0, microsecondsPerBeat: Math.round(60_000_000 / 90) }]);
  });

  it("puts melodic channels on MIDI channels 0-2 and drums on 9", () => {
    const track = song([channel("a", "square", [note(60, 0)]), channel("b", "triangle", [note(62, 0)]), channel("c", "sawtooth", [note(40, 0)]), channel("d", "noise", [note(48, 0)])]);
    const channels = roundTrip(track).tracks.slice(1).map((t) => t.notes[0].channel);
    expect(channels).toEqual([0, 1, 2, 9]);
  });

  it("keeps note starts, durations and velocity in ticks", () => {
    const [, lead] = roundTrip(song([channel("Lead", "square", [note(60, 1.5, 0.5, 0.5)])])).tracks;
    expect(lead.notes).toEqual([{ channel: 0, pitch: 60, velocity: 64, startTick: 720, durationTicks: 240 }]);
  });

  it("plays the intro then one loop pass with repeats expanded, leaving out notes past a section's length", () => {
    const lead = { ...channel("Lead", "square", []), patterns: [
      { id: "intro", notes: [note(60, 0)] },
      { id: "loop", notes: [note(62, 0), note(64, 9)] },
    ] };
    const track = song([lead], {
      loopStartId: "loop",
      sections: [
        { id: "intro", name: "Intro", length: 8, patterns: [{ channelId: "Lead", patternId: "intro" }] },
        { id: "loop", name: "Loop", length: 8, repeat: 2, patterns: [{ channelId: "Lead", patternId: "loop" }] },
      ],
    });
    const [, midiLead] = roundTrip(track).tracks;
    expect(midiLead.notes.map((n) => [n.pitch, n.startTick / 480])).toEqual([[60, 0], [62, 8], [62, 16]]);
  });

  it("writes drum pitches that the Music importer maps back to the same band", () => {
    const pitches = [48, 56, 64, 72, 80, 84];
    const track = song([channel("Drums", "noise", pitches.map((pitch, index) => note(pitch, index)))]);
    const { song: imported } = midiToSong(roundTrip(track), "x.mid");
    const drums = imported.channels.find((c) => c.instrument === "noise");
    expect(drums?.patterns[0].notes.map((n) => n.pitch)).toEqual(pitches);
  });
});
