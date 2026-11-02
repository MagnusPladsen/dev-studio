import { describe, expect, it } from "vitest";
import type { MusicNote, MusicTrack } from "@/types";
import { beatAt, scheduleWindow, type LiveSong } from "./music-scheduler";

function note(start: number, pitch = 60): MusicNote {
  return { pitch, start, duration: 0.5, velocity: 0.8 };
}

function song(notes: MusicNote[][], overrides: Partial<LiveSong> = {}, bpm = 60): LiveSong {
  const track = {
    bpm,
    channels: notes.map((n, i) => ({ id: `c${i}`, name: `c${i}`, instrument: "square", volume: 0.5, patterns: [{ id: "p", notes: n }] })),
  } as MusicTrack;
  return { track, patternLen: 4, muted: notes.map(() => false), soloed: notes.map(() => false), looping: true, ...overrides };
}

const starts = (result: ReturnType<typeof scheduleWindow>) => result.notes.map((d) => d.passStart + d.note.start * d.beatDuration);

describe("scheduleWindow", () => {
  it("only hands out notes inside the window", () => {
    const result = scheduleWindow(song([[note(0), note(1), note(2)]]), { time: 10, beat: 0 }, 11.5);
    expect(starts(result)).toEqual([10, 11]);
    expect(result.cursor).toEqual({ time: 11.5, beat: 1.5 });
  });

  it("picks up notes added after playback started", () => {
    const first = scheduleWindow(song([[note(0)]]), { time: 0, beat: 0 }, 1);
    const edited = song([[note(0), note(2)]]);
    expect(starts(scheduleWindow(edited, first.cursor, 3))).toEqual([2]);
  });

  it("uses a new tempo from the cursor on", () => {
    const first = scheduleWindow(song([[note(0), note(2)]]), { time: 0, beat: 0 }, 1);
    const faster = song([[note(0), note(2)]], {}, 120);
    const next = scheduleWindow(faster, first.cursor, 2);
    expect(starts(next)).toEqual([1.5]);
    expect(next.notes[0].beatDuration).toBe(0.5);
  });

  it("wraps to the start of the loop", () => {
    const result = scheduleWindow(song([[note(0), note(3)]]), { time: 0, beat: 2.5 }, 2);
    expect(starts(result)).toEqual([0.5, 1.5]);
    expect(result.cursor.beat).toBeCloseTo(0.5);
    expect(result.ended).toBe(false);
  });

  it("ends at the loop end when looping is off", () => {
    const result = scheduleWindow(song([[note(0), note(3)]], { looping: false }), { time: 0, beat: 2.5 }, 2);
    expect(starts(result)).toEqual([0.5]);
    expect(result.cursor).toEqual({ time: 1.5, beat: 4 });
    expect(result.ended).toBe(true);
  });

  it("follows mute and solo as they change", () => {
    const notes = [[note(0, 60)], [note(0, 72)]];
    const pitches = (s: LiveSong) => scheduleWindow(s, { time: 0, beat: 0 }, 1).notes.map((d) => d.note.pitch);
    expect(pitches(song(notes, { muted: [true, false] }))).toEqual([72]);
    expect(pitches(song(notes, { soloed: [true, false] }))).toEqual([60]);
  });

  it("wraps when the loop gets shorter than the cursor", () => {
    const result = scheduleWindow(song([[note(0)]]), { time: 0, beat: 6 }, 0.5);
    expect(starts(result)).toEqual([0]);
  });
});

describe("beatAt", () => {
  it("counts back from the scheduled cursor and wraps", () => {
    expect(beatAt(song([[]]), { time: 10, beat: 1.5 }, 9.8)).toBeCloseTo(1.3);
    expect(beatAt(song([[]]), { time: 10, beat: 0.1 }, 9.8)).toBeCloseTo(3.9);
  });
});
