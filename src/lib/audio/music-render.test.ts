import { describe, expect, it } from "vitest";
import type { MusicChannel, MusicTrack } from "@/types";
import { loopSampleCount, renderLoop } from "./music-render";
import { scheduleWindow } from "./music-scheduler";
import { scheduleNote } from "./music-synth";

type Call = [string, ...unknown[]];

/** Records every Web Audio call the synth makes, so render and playback can be compared. */
function recordingContext(length = 0, sampleRate = 44100) {
  const calls: Call[] = [];
  const param = (name: string) => ({
    value: 0,
    setValueAtTime: (...args: unknown[]) => calls.push([`${name}.setValueAtTime`, ...args]),
    exponentialRampToValueAtTime: (...args: unknown[]) => calls.push([`${name}.exponentialRampToValueAtTime`, ...args]),
  });
  const node = (kind: string) => ({
    connect: () => calls.push([`${kind}.connect`]),
    start: (...args: unknown[]) => calls.push([`${kind}.start`, ...args]),
    stop: (...args: unknown[]) => calls.push([`${kind}.stop`, ...args]),
  });
  const ctx = {
    sampleRate,
    destination: {},
    createGain: () => ({ ...node("gain"), gain: param("gain") }),
    createOscillator: () => ({
      ...node("osc"),
      frequency: param("frequency"),
      set type(type: string) {
        calls.push(["osc.type", type]);
      },
    }),
    createBufferSource: () => ({ ...node("noise"), buffer: null }),
    createBuffer: (_channels: number, frames: number) => ({ getChannelData: () => new Float32Array(frames) }),
    createBiquadFilter: () => ({
      ...node("filter"),
      frequency: { value: 0 },
      Q: { value: 0 },
      set type(type: string) {
        calls.push(["filter.type", type]);
      },
    }),
    startRendering: async () => ({ length, getChannelData: () => new Float32Array(length) }),
  };
  return { ctx: ctx as unknown as OfflineAudioContext, calls };
}

function channel(instrument: string, notes: MusicChannel["patterns"][0]["notes"]): MusicChannel {
  return { id: instrument, name: instrument, instrument, volume: 0.5, patterns: [{ id: "p", notes }] };
}

const track = {
  bpm: 120,
  channels: [
    channel("square", [{ pitch: 60, start: 0, duration: 1, velocity: 1 }, { pitch: 64, start: 7.5, duration: 2, velocity: 0.8 }]),
    channel("noise", [{ pitch: 48, start: 1, duration: 0.5, velocity: 1 }, { pitch: 84, start: 9, duration: 0.5, velocity: 1 }]),
  ],
} as MusicTrack;

const options = { patternLen: 8, muted: [false, false], soloed: [false, false] };

describe("loopSampleCount", () => {
  it("is one pass of the loop at the track's tempo", () => {
    expect(loopSampleCount(track, 8, 44100)).toBe(4 * 44100);
    expect(loopSampleCount({ ...track, bpm: 90 }, 16, 48000)).toBe(Math.ceil((16 * 60 * 48000) / 90));
  });
});

describe("renderLoop", () => {
  it("renders exactly one pass of the loop", async () => {
    let requested = 0;
    const samples = await renderLoop(track, {
      ...options,
      createContext: (length, sampleRate) => {
        requested = length;
        return recordingContext(length, sampleRate).ctx;
      },
    });
    expect(requested).toBe(4 * 44100);
    expect(samples.length).toBe(requested);
  });

  it("drives the synth exactly as Play does for one pass", async () => {
    const rendered = recordingContext(4 * 44100);
    await renderLoop(track, { ...options, createContext: () => rendered.ctx });

    const played = recordingContext();
    const song = { track, ...options, looping: false };
    for (const due of scheduleWindow(song, { time: 0, beat: 0 }, 4).notes) {
      scheduleNote(played.ctx, played.ctx.destination, due.note, due.instrument, due.volume, due.passStart, due.beatDuration);
    }

    expect(rendered.calls).toEqual(played.calls);
    // same voices as the editor: band-passed noise drums and an exponential decay
    expect(rendered.calls).toContainEqual(["filter.type", "bandpass"]);
    expect(rendered.calls).toContainEqual(["osc.type", "square"]);
    expect(rendered.calls).toContainEqual(["gain.exponentialRampToValueAtTime", 0.001, 0.5]);
  });

  it("leaves out notes past the loop and muted or unsoloed channels", async () => {
    const all = recordingContext(4 * 44100);
    await renderLoop(track, { ...options, createContext: () => all.ctx });
    expect(all.calls.filter(([name]) => name === "osc.start")).toHaveLength(2);
    expect(all.calls.filter(([name]) => name === "noise.start")).toHaveLength(1);

    const muted = recordingContext(4 * 44100);
    await renderLoop(track, { ...options, muted: [false, true], createContext: () => muted.ctx });
    expect(muted.calls.some(([name]) => name === "noise.start")).toBe(false);

    const soloed = recordingContext(4 * 44100);
    await renderLoop(track, { ...options, soloed: [false, true], createContext: () => soloed.ctx });
    expect(soloed.calls.some(([name]) => name === "osc.start")).toBe(false);
  });
});
