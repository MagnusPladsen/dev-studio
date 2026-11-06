import { describe, expect, it } from "vitest";
import type { MusicChannel, MusicTrack } from "@/types";
import { applyGain, fadeOut, MAX_TAIL_SECONDS, peakGain, tailSeconds, wrapTail } from "./music-game-export";

function channel(id: string, notes: MusicChannel["patterns"][0]["notes"], envelope?: MusicChannel["envelope"]): MusicChannel {
  return { id, name: id, instrument: "square", envelope, volume: 1, patterns: [{ id: `${id}-p`, notes }] };
}

function track(channels: MusicChannel[], bpm = 60): MusicTrack {
  return { id: "t", projectId: "p", name: "T", bpm, channels, tags: [], createdAt: "", updatedAt: "" };
}

describe("wrapTail", () => {
  it("adds the samples after the loop end onto the loop start", () => {
    const out = wrapTail(new Float32Array([0, 0, 0, 0, 1, 1]), 1, 4);
    expect(Array.from(out)).toEqual([0, 1, 1, 0]);
  });

  it("wraps again when the tail is longer than the loop", () => {
    const out = wrapTail(new Float32Array([0, 0, 0, 1, 1, 1, 1, 1]), 1, 3);
    expect(Array.from(out)).toEqual([0, 3, 2]);
  });
});

describe("fadeOut", () => {
  const ones = new Float32Array(100).fill(1);

  it("keeps the start, shapes the middle, and silences after the end", () => {
    const out = fadeOut(ones, 20, 40);
    expect(out[20]).toBeCloseTo(1);
    expect(out[40]).toBeCloseTo(Math.cos(Math.PI / 4) ** 2);
    expect(out[60]).toBe(0);
    expect(out[99]).toBe(0);
    expect(out[10]).toBe(1);
  });
});

describe("peakGain", () => {
  it("scales the loudest sample across all buffers to the target", () => {
    const gain = peakGain([new Float32Array([0.1, -0.2]), new Float32Array([0.4])], 0.8);
    expect(gain).toBeCloseTo(2);
  });

  it("is 1 for silence", () => {
    expect(peakGain([new Float32Array(4)])).toBe(1);
  });
});

describe("applyGain", () => {
  it("multiplies every sample", () => {
    expect(Array.from(applyGain(new Float32Array([0.5, -1]), 2))).toEqual([1, -2]);
  });
});

describe("tailSeconds", () => {
  const note = { pitch: 60, start: 0, duration: 1, velocity: 1 };

  it("is the envelope release for an envelope channel", () => {
    const envelope = { attack: 0, decay: 0.1, sustain: 0.5, release: 0.8 };
    expect(tailSeconds(track([channel("a", [note], envelope)]))).toBeCloseTo(0.8);
  });

  it("is zero for a Classic channel whose notes end inside the section", () => {
    expect(tailSeconds(track([channel("a", [note])]))).toBe(0);
  });

  it("adds the longest note overhang past the section end", () => {
    const envelope = { attack: 0, decay: 0.1, sustain: 0.5, release: 0.5 };
    const overhanging = { pitch: 60, start: 6, duration: 4, velocity: 1 };
    const song = track([channel("a", [overhanging], envelope)], 120);
    song.sections = [{ id: "s", name: "A", length: 8, patterns: [{ channelId: "a", patternId: "a-p" }] }];
    expect(tailSeconds(song)).toBeCloseTo(0.5 + 1);
  });

  it("is capped", () => {
    const envelope = { attack: 0, decay: 0.1, sustain: 0.5, release: 10 };
    expect(tailSeconds(track([channel("a", [note], envelope)]))).toBe(MAX_TAIL_SECONDS);
  });
});
