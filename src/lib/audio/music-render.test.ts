import { describe, expect, it } from "vitest";
import type { MusicChannel, MusicNote, MusicTrack } from "@/types";
import { songSampleCount, renderSong } from "./music-render";
import { scheduleWindow } from "./music-scheduler";
import { applyPreset } from "./music-instruments";
import { LEGACY_SECTION_ID } from "@/lib/music-sections";
import { midiToFreq, scheduleNote } from "./music-synth";

type Call = [string, ...unknown[]];

/** Records every Web Audio call the synth makes, so render and playback can be compared. */
function recordingContext(length = 0, sampleRate = 44100) {
  const calls: Call[] = [];
  const param = (name: string) => ({
    value: 0,
    setValueAtTime: (...args: unknown[]) => calls.push([`${name}.setValueAtTime`, ...args]),
    exponentialRampToValueAtTime: (...args: unknown[]) => calls.push([`${name}.exponentialRampToValueAtTime`, ...args]),
    linearRampToValueAtTime: (...args: unknown[]) => calls.push([`${name}.linearRampToValueAtTime`, ...args]),
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
      detune: param("detune"),
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

const withInstruments = {
  ...track,
  channels: [applyPreset(track.channels[0], "lead"), applyPreset(track.channels[1], "drum-kit")],
} as MusicTrack;

const steps = [{ sectionId: LEGACY_SECTION_ID, length: 8 }];
const options = { steps, muted: [false, false], soloed: [false, false] };

describe("songSampleCount", () => {
  it("is one pass of the loop at the track's tempo", () => {
    expect(songSampleCount(track, steps, 44100)).toBe(4 * 44100);
    expect(songSampleCount({ ...track, bpm: 60 }, [{ sectionId: "a", length: 8 }, { sectionId: "b", length: 8 }], 100)).toBe(1600);
    expect(songSampleCount({ ...track, bpm: 90 }, [{ sectionId: LEGACY_SECTION_ID, length: 16 }], 48000)).toBe(Math.ceil((16 * 60 * 48000) / 90));
  });
});

describe("renderSong", () => {
  it("renders exactly one pass of the loop", async () => {
    let requested = 0;
    const samples = await renderSong(track, {
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
    await renderSong(track, { ...options, createContext: () => rendered.ctx });

    const played = recordingContext();
    const song = { track, ...options, loopIndex: 0, looping: false };
    for (const due of scheduleWindow(song, { time: 0, step: 0, beat: 0 }, 4).notes) {
      scheduleNote(played.ctx, played.ctx.destination, due.note, due.voice, due.volume, due.passStart, due.beatDuration);
    }

    expect(rendered.calls).toEqual(played.calls);
    // same voices as the editor: band-passed noise drums and an exponential decay
    expect(rendered.calls).toContainEqual(["filter.type", "bandpass"]);
    expect(rendered.calls).toContainEqual(["osc.type", "square"]);
    expect(rendered.calls).toContainEqual(["gain.exponentialRampToValueAtTime", 0.001, 0.5]);
  });

  it("drives the synth exactly as Play does with instruments: envelopes, release tails and vibrato", async () => {
    const rendered = recordingContext(4 * 44100);
    await renderSong(withInstruments, { ...options, createContext: () => rendered.ctx });

    const played = recordingContext();
    const song = { track: withInstruments, ...options, loopIndex: 0, looping: false };
    for (const due of scheduleWindow(song, { time: 0, step: 0, beat: 0 }, 4).notes) {
      scheduleNote(played.ctx, played.ctx.destination, due.note, due.voice, due.volume, due.passStart, due.beatDuration);
    }

    expect(rendered.calls).toEqual(played.calls);
    expect(rendered.calls).toContainEqual(["gain.linearRampToValueAtTime", 0.15, 0.01]);
    expect(rendered.calls).toContainEqual(["frequency.setValueAtTime", 5.5, 0]);
    // the lead's first note is held half a second, then rings for its 0.1 s release
    expect(rendered.calls).toContainEqual(["osc.stop", 0.6]);
  });

  it("leaves out notes past the loop and muted or unsoloed channels", async () => {
    const all = recordingContext(4 * 44100);
    await renderSong(track, { ...options, createContext: () => all.ctx });
    expect(all.calls.filter(([name]) => name === "osc.start")).toHaveLength(2);
    expect(all.calls.filter(([name]) => name === "noise.start")).toHaveLength(1);

    const muted = recordingContext(4 * 44100);
    await renderSong(track, { ...options, muted: [false, true], createContext: () => muted.ctx });
    expect(muted.calls.some(([name]) => name === "noise.start")).toBe(false);

    const soloed = recordingContext(4 * 44100);
    await renderSong(track, { ...options, soloed: [false, true], createContext: () => soloed.ctx });
    expect(soloed.calls.some(([name]) => name === "osc.start")).toBe(false);
  });
});

/** `scheduleNote` exactly as it shipped before instruments (#34), kept to prove Classic still sounds the same. */
function scheduleNoteBeforeInstruments(
  ctx: BaseAudioContext,
  destination: AudioNode,
  note: MusicNote,
  instrument: string,
  volume: number,
  when: number,
  beatDuration: number
) {
  const startTime = when + note.start * beatDuration;
  const dur = note.duration * beatDuration;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume * note.velocity * 0.3, startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + dur);
  gain.connect(destination);
  if (instrument === "noise") {
    const src = ctx.createBufferSource();
    src.buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
    const bpf = ctx.createBiquadFilter();
    bpf.type = "bandpass";
    bpf.frequency.value = midiToFreq(note.pitch);
    bpf.Q.value = 1;
    src.connect(bpf);
    bpf.connect(gain);
    src.start(startTime);
    src.stop(startTime + dur);
    return;
  }
  const osc = ctx.createOscillator();
  osc.type = instrument as OscillatorType;
  osc.frequency.setValueAtTime(midiToFreq(note.pitch), startTime);
  osc.connect(gain);
  osc.start(startTime);
  osc.stop(startTime + dur);
}

describe("the Classic instrument", () => {
  // Web Audio renders the same graph and automation to the same samples, so the same calls mean the same sound.
  it("makes the exact calls the synth made before instruments, for every wave", () => {
    const notes: MusicNote[] = [
      { pitch: 48, start: 0, duration: 0.25, velocity: 1 },
      { pitch: 67, start: 1.5, duration: 2, velocity: 0.6 },
      { pitch: 84, start: 3, duration: 4, velocity: 0.8 },
    ];
    for (const wave of ["square", "sawtooth", "sine", "triangle", "noise"]) {
      const before = recordingContext();
      const now = recordingContext();
      for (const note of notes) {
        scheduleNoteBeforeInstruments(before.ctx, before.ctx.destination, note, wave, 0.45, 2, 0.5);
        scheduleNote(now.ctx, now.ctx.destination, note, { instrument: wave }, 0.45, 2, 0.5);
      }
      expect(now.calls).toEqual(before.calls);
      expect(now.calls.length).toBeGreaterThan(0);
    }
  });
});
