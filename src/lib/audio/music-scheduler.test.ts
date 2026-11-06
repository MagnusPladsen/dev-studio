import { describe, expect, it } from "vitest";
import type { MusicNote, MusicTrack } from "@/types";
import { LEGACY_SECTION_ID, addSection, assignPattern, setLoopStart, setSectionNotes, songSteps, updateSection } from "@/lib/music-sections";
import { beatAt, scheduleWindow, type LiveSong } from "./music-scheduler";

function note(start: number, pitch = 60): MusicNote {
  return { pitch, start, duration: 0.5, velocity: 0.8 };
}

function song(notes: MusicNote[][], overrides: Partial<LiveSong> = {}, bpm = 60): LiveSong {
  const track = {
    bpm,
    channels: notes.map((n, i) => ({ id: `c${i}`, name: `c${i}`, instrument: "square", volume: 0.5, patterns: [{ id: "p", notes: n }] })),
  } as MusicTrack;
  return { track, steps: [{ sectionId: LEGACY_SECTION_ID, length: 4 }], loopIndex: 0, muted: notes.map(() => false), soloed: notes.map(() => false), looping: true, ...overrides };
}

const starts = (result: ReturnType<typeof scheduleWindow>) => result.notes.map((d) => d.passStart + d.note.start * d.beatDuration);

describe("scheduleWindow", () => {
  it("only hands out notes inside the window", () => {
    const result = scheduleWindow(song([[note(0), note(1), note(2)]]), { time: 10, step: 0, beat: 0 }, 11.5);
    expect(starts(result)).toEqual([10, 11]);
    expect(result.cursor).toEqual({ time: 11.5, step: 0, beat: 1.5 });
  });

  it("picks up notes added after playback started", () => {
    const first = scheduleWindow(song([[note(0)]]), { time: 0, step: 0, beat: 0 }, 1);
    const edited = song([[note(0), note(2)]]);
    expect(starts(scheduleWindow(edited, first.cursor, 3))).toEqual([2]);
  });

  it("uses a new tempo from the cursor on", () => {
    const first = scheduleWindow(song([[note(0), note(2)]]), { time: 0, step: 0, beat: 0 }, 1);
    const faster = song([[note(0), note(2)]], {}, 120);
    const next = scheduleWindow(faster, first.cursor, 2);
    expect(starts(next)).toEqual([1.5]);
    expect(next.notes[0].beatDuration).toBe(0.5);
  });

  it("wraps to the start of the loop", () => {
    const result = scheduleWindow(song([[note(0), note(3)]]), { time: 0, step: 0, beat: 2.5 }, 2);
    expect(starts(result)).toEqual([0.5, 1.5]);
    expect(result.cursor.beat).toBeCloseTo(0.5);
    expect(result.ended).toBe(false);
  });

  it("ends at the loop end when looping is off", () => {
    const result = scheduleWindow(song([[note(0), note(3)]], { looping: false }), { time: 0, step: 0, beat: 2.5 }, 2);
    expect(starts(result)).toEqual([0.5]);
    expect(result.cursor).toEqual({ time: 1.5, step: 0, beat: 4 });
    expect(result.ended).toBe(true);
  });

  it("follows mute and solo as they change", () => {
    const notes = [[note(0, 60)], [note(0, 72)]];
    const pitches = (s: LiveSong) => scheduleWindow(s, { time: 0, step: 0, beat: 0 }, 1).notes.map((d) => d.note.pitch);
    expect(pitches(song(notes, { muted: [true, false] }))).toEqual([72]);
    expect(pitches(song(notes, { soloed: [true, false] }))).toEqual([60]);
  });

  it("wraps when the loop gets shorter than the cursor", () => {
    const result = scheduleWindow(song([[note(0)]]), { time: 0, step: 0, beat: 6 }, 0.5);
    expect(starts(result)).toEqual([0]);
  });
});

describe("beatAt", () => {
  it("counts back from the scheduled cursor and wraps", () => {
    expect(beatAt(song([[]]), { time: 10, step: 0, beat: 1.5 }, 9.8).beat).toBeCloseTo(1.3);
    expect(beatAt(song([[]]), { time: 10, step: 0, beat: 0.1 }, 9.8).beat).toBeCloseTo(3.9);
  });
});

function sectioned(): { base: MusicTrack; a: string; b: string } {
  const base = song([[]]).track;
  const first = addSection(setSectionNotes(base, LEGACY_SECTION_ID, "c0", () => [note(0)]), LEGACY_SECTION_ID, "empty");
  const withB = setSectionNotes(first.track, first.sectionId, "c0", () => [note(1)]);
  return { base: updateSection(updateSection(withB, LEGACY_SECTION_ID, { length: 8 }), first.sectionId, { length: 8 }), a: LEGACY_SECTION_ID, b: first.sectionId };
}

function liveFrom(track: MusicTrack, mode: "song" | "section", sectionId: string, looping: boolean): LiveSong {
  return { track, ...songSteps(track, mode, sectionId), muted: [false], soloed: [false], looping };
}

describe("scheduleWindow over sections", () => {
  it("plays each section in order, then ends when not looping", () => {
    const { base, a } = sectioned();
    const live = liveFrom(base, "song", a, false);
    live.steps = live.steps.map((step) => ({ ...step, length: 4 }));
    const result = scheduleWindow(live, { time: 0, step: 0, beat: 0 }, 20);
    expect(starts(result)).toEqual([0, 5]);
    expect(result.ended).toBe(true);
  });

  it("loops back to the loop start, playing the intro once", () => {
    const { base, a, b } = sectioned();
    const introTrack = setSectionNotes(setLoopStart(base, b), a, "c0", () => [note(0, 70)]);
    const live = liveFrom(setSectionNotes(introTrack, b, "c0", () => [note(0, 60)]), "song", a, true);
    live.steps = live.steps.map((step) => ({ ...step, length: 4 }));
    const result = scheduleWindow(live, { time: 0, step: 0, beat: 0 }, 13);
    expect(result.notes.map((due) => [due.note.pitch, due.passStart + due.note.start * due.beatDuration])).toEqual([
      [70, 0],
      [60, 4],
      [60, 8],
      [60, 12],
    ]);
  });

  it("expands a repeated section into passes", () => {
    const { base, a } = sectioned();
    const repeated = updateSection(base, a, { repeat: 2 });
    const live = liveFrom(repeated, "song", a, false);
    live.steps = live.steps.map((step) => ({ ...step, length: 4 }));
    expect(starts(scheduleWindow(live, { time: 0, step: 0, beat: 0 }, 30))).toEqual([0, 4, 9]);
  });

  it("drops a linked pattern note that lies past a shorter section", () => {
    const { base, a, b } = sectioned();
    const long = setSectionNotes(base, a, "c0", () => [note(6)]);
    const patternId = long.sections?.find((section) => section.id === a)?.patterns[0].patternId ?? "";
    const linked = assignPattern(long, b, "c0", patternId);
    const live = liveFrom(linked, "song", a, false);
    live.steps = [{ sectionId: a, length: 8 }, { sectionId: b, length: 4 }];
    expect(starts(scheduleWindow(live, { time: 0, step: 0, beat: 0 }, 30))).toEqual([6]);
  });

  it("plays a deleted section as silence for its length and does not crash", () => {
    const { base, a } = sectioned();
    const live = liveFrom(base, "song", a, false);
    live.steps = [{ sectionId: "gone", length: 4 }, { sectionId: a, length: 4 }];
    const result = scheduleWindow(live, { time: 0, step: 0, beat: 0 }, 20);
    expect(starts(result)).toEqual([4]);
    expect(result.ended).toBe(true);
  });

  it("ends at once without steps", () => {
    const live = { ...song([[note(0)]]), steps: [] };
    expect(scheduleWindow(live, { time: 0, step: 0, beat: 0 }, 5)).toEqual({ notes: [], cursor: { time: 0, step: 0, beat: 0 }, ended: true });
  });
});

describe("beatAt over sections", () => {
  const twoSteps = () => ({ ...song([[]]), steps: [{ sectionId: LEGACY_SECTION_ID, length: 4 }, { sectionId: "b", length: 4 }] });

  it("reports the previous step when the cursor is already past the boundary", () => {
    const at = beatAt(twoSteps(), { time: 10, step: 1, beat: 0.1 }, 9.8);
    expect(at.step).toBe(0);
    expect(at.beat).toBeCloseTo(3.9);
  });

  it("stays at the very start before beat 0 of the first pass", () => {
    expect(beatAt({ ...twoSteps(), looping: false }, { time: 10, step: 0, beat: 0.1 }, 9)).toEqual({ step: 0, beat: 0 });
  });

  it("goes to the last step across the loop wrap", () => {
    const at = beatAt({ ...twoSteps(), loopIndex: 0 }, { time: 10, step: 0, beat: 0.1 }, 9.8);
    expect(at.step).toBe(1);
    expect(at.beat).toBeCloseTo(3.9);
  });
});
