import { describe, expect, it } from "vitest";
import type { MusicChannel, MusicTrack } from "@/types";
import { unzipSync } from "fflate";
import {
  applyGain,
  buildGameExport,
  DEFAULT_GAME_EXPORT,
  fadeOut,
  hasIntro,
  introSeconds,
  MAX_TAIL_SECONDS,
  NORMALISE_PEAK,
  peakGain,
  readGameExportOptions,
  tailSeconds,
  wrapTail,
  type GameExportOptions,
} from "./music-game-export";
import { RENDER_SAMPLE_RATE } from "./music-render";

function channel(id: string, notes: MusicChannel["patterns"][0]["notes"], envelope?: MusicChannel["envelope"]): MusicChannel {
  return { id, name: id, instrument: "square", envelope, volume: 1, patterns: [{ id: `${id}-p`, notes }] };
}

function track(channels: MusicChannel[], bpm = 60): MusicTrack {
  return { id: "t", projectId: "p", name: "T", bpm, channels, tags: [], createdAt: "", updatedAt: "" };
}

const BOX_LEVEL = 0.1;

/** A stand-in for OfflineAudioContext: every started source adds BOX_LEVEL from its start to its stop, so mixes add up exactly. */
function boxContext(length: number, sampleRate: number): OfflineAudioContext {
  const spans: { start: number; stop: number }[] = [];
  const param = () => ({ value: 0, setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {}, linearRampToValueAtTime: () => {} });
  const source = () => {
    const span = { start: 0, stop: 0 };
    spans.push(span);
    return { connect: () => {}, start: (time: number) => (span.start = time), stop: (time: number) => (span.stop = time) };
  };
  const ctx = {
    sampleRate,
    destination: {},
    createGain: () => ({ connect: () => {}, gain: param() }),
    createOscillator: () => ({ ...source(), frequency: param(), detune: param(), type: "square" }),
    createBufferSource: () => ({ ...source(), buffer: null }),
    createBuffer: (_channels: number, frames: number) => ({ getChannelData: () => new Float32Array(frames) }),
    createBiquadFilter: () => ({ connect: () => {}, frequency: { value: 0 }, Q: { value: 0 }, type: "bandpass" }),
    startRendering: async () => {
      const data = new Float32Array(length);
      for (const span of spans) {
        for (let i = Math.round(span.start * sampleRate); i < Math.min(length, Math.round(span.stop * sampleRate)); i++) data[i] += BOX_LEVEL;
      }
      return { length, getChannelData: () => data };
    },
  };
  return ctx as unknown as OfflineAudioContext;
}

/** An OGG encoder stand-in that keeps the samples it was given, so tests can read every file back. */
function fakeOgg() {
  const encoded: Float32Array[] = [];
  const encodeOgg = async (samples: Float32Array): Promise<Uint8Array> => {
    encoded.push(samples);
    return new TextEncoder().encode(`ogg:${encoded.length - 1}`);
  };
  const decode = (bytes: Uint8Array): Float32Array => encoded[Number(new TextDecoder().decode(bytes).slice(4))];
  return { deps: { createContext: boxContext, encodeOgg }, decode };
}

function readWav(bytes: Uint8Array): { samples: number; loop?: { start: number; end: number } } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const dataBytes = view.getUint32(40, true);
  const smpl = 44 + dataBytes;
  if (smpl >= bytes.length) return { samples: dataBytes / 2 };
  return { samples: dataBytes / 2, loop: { start: view.getUint32(smpl + 8 + 44, true), end: view.getUint32(smpl + 8 + 48, true) } };
}

function peak(samples: Float32Array): number {
  return samples.reduce((loudest, sample) => Math.max(loudest, Math.abs(sample)), 0);
}

/** Intro section (8 beats) then a 16-beat loop; Lead and Drums both play beat 0 of the intro. */
function sectioned(bpm: number): MusicTrack {
  const note = { pitch: 60, start: 0, duration: 0.5, velocity: 1 };
  const lead = { ...channel("lead", [note]), name: "Lead", patterns: [{ id: "lead-p", notes: [note, { ...note, start: 4 }] }] };
  const drums = { ...channel("drums", [note]), name: "Drums", instrument: "noise", patterns: [{ id: "drums-p", notes: [note, { ...note, start: 2 }] }] };
  return {
    ...track([lead, drums], bpm),
    name: "Theme",
    sections: [
      { id: "intro", name: "I", length: 8, patterns: [{ channelId: "lead", patternId: "lead-p" }, { channelId: "drums", patternId: "drums-p" }] },
      { id: "loop", name: "L", length: 16, patterns: [{ channelId: "lead", patternId: "lead-p" }, { channelId: "drums", patternId: "drums-p" }] },
    ],
    loopStartId: "loop",
  };
}

/** One 8-beat section at 60 bpm whose only note starts at beat 7 and rings 1 s past the end. */
function ringingSong(): MusicTrack {
  const ringing = { pitch: 60, start: 7, duration: 2, velocity: 1 };
  return {
    ...track([channel("a", [ringing])]),
    name: "Theme",
    sections: [{ id: "loop", name: "A", length: 8, patterns: [{ channelId: "a", patternId: "a-p" }] }],
  };
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

describe("introSeconds and hasIntro", () => {
  it("is the time before the loop step", () => {
    expect(introSeconds(sectioned(73))).toBeCloseTo((8 * 60) / 73);
    expect(hasIntro(sectioned(73))).toBe(true);
  });

  it("is zero when the song loops from the start", () => {
    const song = { ...sectioned(73), loopStartId: "intro" };
    expect(introSeconds(song)).toBe(0);
    expect(hasIntro(song)).toBe(false);
  });
});

describe("buildGameExport", () => {
  const rate = RENDER_SAMPLE_RATE;
  const introSamples = Math.round(((8 * 60) / 73) * rate);
  const loopSamples = Math.round(((16 * 60) / 73) * rate);

  it("writes intro + one loop pass with a smpl loop from the loop start to the last sample", async () => {
    const file = await buildGameExport(sectioned(73), { ...DEFAULT_GAME_EXPORT, format: "wav", normalise: false }, { createContext: boxContext });
    expect(file.name).toBe("Theme.wav");
    const wav = readWav(file.bytes);
    expect(wav.samples).toBe(introSamples + loopSamples);
    expect(wav.loop).toEqual({ start: introSamples, end: introSamples + loopSamples - 1 });
  });

  it("loops from sample 0 with the tail wrapped there when there is no intro (Review Focus 1)", async () => {
    const song = ringingSong();
    const { deps, decode } = fakeOgg();
    const file = await buildGameExport(song, { ...DEFAULT_GAME_EXPORT, normalise: false }, deps);
    const samples = decode(file.bytes);
    expect(hasIntro(song)).toBe(false);
    expect(samples.length).toBe(8 * rate);
    // the note rings 1 s past the end, so it is heard again in the first second
    expect(samples[Math.round(0.5 * rate)]).toBeCloseTo(BOX_LEVEL);
    expect(samples[Math.round(1.5 * rate)]).toBe(0);
  });

  it("keeps the exact length and wraps the tail onto the loop start after an intro (Review Focus 2)", async () => {
    const song = ringingSong();
    song.sections = [{ id: "intro", name: "I", length: 8, patterns: [] }, ...(song.sections ?? [])];
    song.loopStartId = "loop";
    const { deps, decode } = fakeOgg();
    const samples = decode((await buildGameExport(song, { ...DEFAULT_GAME_EXPORT, normalise: false }, deps)).bytes);
    expect(samples.length).toBe(16 * rate);
    expect(samples[Math.round(4 * rate)]).toBe(0);
    expect(samples[Math.round(8.5 * rate)]).toBeCloseTo(BOX_LEVEL);
    expect(samples[Math.round(9.5 * rate)]).toBe(0);
  });

  it("keeps the intro ringing on past the loop start in the looping file", async () => {
    const song = ringingSong();
    const ringingIntro = { pitch: 60, start: 7, duration: 2, velocity: 1 };
    song.channels = [{ ...song.channels[0], patterns: [...song.channels[0].patterns, { id: "intro-p", notes: [ringingIntro] }] }];
    song.sections = [{ id: "intro", name: "I", length: 8, patterns: [{ channelId: "a", patternId: "intro-p" }] }, ...(song.sections ?? [])];
    song.loopStartId = "loop";
    const { deps, decode } = fakeOgg();
    const samples = decode((await buildGameExport(song, { ...DEFAULT_GAME_EXPORT, normalise: false }, deps)).bytes);
    expect(samples.length).toBe(16 * rate);
    // just after the loop start: the intro's ring-out plus the loop's own wrapped tail
    expect(samples[Math.round(8.5 * rate)]).toBeCloseTo(2 * BOX_LEVEL);
  });

  it("zips an intro file and a loop file for intro-and-loop", async () => {
    const { deps, decode } = fakeOgg();
    const file = await buildGameExport(sectioned(73), { ...DEFAULT_GAME_EXPORT, mode: "intro-and-loop" }, deps);
    expect(file.name).toBe("Theme.zip");
    const entries = unzipSync(file.bytes);
    expect(Object.keys(entries)).toEqual(["Theme - intro.ogg", "Theme - loop.ogg"]);
    expect(decode(entries["Theme - intro.ogg"]).length).toBe(introSamples);
    expect(decode(entries["Theme - loop.ogg"]).length).toBe(loopSamples);
  });

  it("plays N loops, fades over F seconds and ends when the fade reaches silence", async () => {
    const song = ringingSong();
    const { deps, decode } = fakeOgg();
    const options: GameExportOptions = { ...DEFAULT_GAME_EXPORT, mode: "fade-out", loops: 3, fadeSeconds: 10, normalise: false };
    const samples = decode((await buildGameExport(song, options, deps)).bytes);
    expect(samples.length).toBe(3 * 8 * rate + 10 * rate);
    expect(samples[Math.round(16.5 * rate)]).toBeCloseTo(BOX_LEVEL);
    expect(samples[samples.length - 1]).toBeCloseTo(0, 6);
    // the loop keeps playing under the fade
    expect(samples[Math.round(24.5 * rate)]).toBeGreaterThan(0);
  });

  it("writes one stem per channel, all the same length, that add up to the mix with one shared gain (Review Focus 3)", async () => {
    const song = sectioned(73);
    const stems = fakeOgg();
    const zip = await buildGameExport(song, { ...DEFAULT_GAME_EXPORT, stems: true }, stems.deps);
    expect(zip.name).toBe("Theme.zip");
    const entries = unzipSync(zip.bytes);
    expect(Object.keys(entries)).toEqual(["Theme - Lead.ogg", "Theme - Drums.ogg"]);
    const [lead, drums] = Object.values(entries).map(stems.decode);
    expect(lead.length).toBe(drums.length);

    const raw = fakeOgg();
    const rawZip = await buildGameExport(song, { ...DEFAULT_GAME_EXPORT, stems: true, normalise: false }, raw.deps);
    const rawStems = Object.values(unzipSync(rawZip.bytes)).map(raw.decode);
    const gain = NORMALISE_PEAK / Math.max(...rawStems.map(peak));
    expect(Math.max(peak(lead), peak(drums))).toBeCloseTo(NORMALISE_PEAK);

    const mix = fakeOgg();
    const unnormalisedMix = mix.decode((await buildGameExport(song, { ...DEFAULT_GAME_EXPORT, normalise: false }, mix.deps)).bytes);
    expect(unnormalisedMix.length).toBe(lead.length);
    for (let i = 0; i < unnormalisedMix.length; i++) {
      expect(Math.abs(lead[i] + drums[i] - unnormalisedMix[i] * gain)).toBeLessThan(1e-5);
    }
  });

  it("writes the same files as loop mode for two files when the song has no intro", async () => {
    const song = { ...sectioned(73), loopStartId: "intro" };
    const looping = fakeOgg();
    const twoFiles = fakeOgg();
    const expected = await buildGameExport(song, { ...DEFAULT_GAME_EXPORT, stems: true }, looping.deps);
    const file = await buildGameExport(song, { ...DEFAULT_GAME_EXPORT, mode: "intro-and-loop", stems: true }, twoFiles.deps);
    expect(file.name).toBe("Theme.zip");
    const entries = unzipSync(file.bytes);
    expect(Object.keys(entries)).toEqual(Object.keys(unzipSync(expected.bytes)));
    expect(Object.values(entries).map(twoFiles.decode)).toEqual(Object.values(unzipSync(expected.bytes)).map(looping.decode));
  });

  it("writes one file for two files without stems when the song has no intro", async () => {
    const { deps } = fakeOgg();
    const file = await buildGameExport({ ...sectioned(73), loopStartId: "intro" }, { ...DEFAULT_GAME_EXPORT, mode: "intro-and-loop" }, deps);
    expect(file.name).toBe("Theme.ogg");
  });

  it("refuses a song whose loop part has no length, for loop and fade-out", async () => {
    const song = sectioned(73);
    song.sections = song.sections?.map((section) => (section.id === "loop" ? { ...section, repeat: 0 } : section));
    const { deps } = fakeOgg();
    await expect(buildGameExport(song, DEFAULT_GAME_EXPORT, deps)).rejects.toThrow("This song has no notes to loop.");
    await expect(buildGameExport(song, { ...DEFAULT_GAME_EXPORT, mode: "fade-out" }, deps)).rejects.toThrow("This song has no notes to loop.");
    await expect(buildGameExport(song, { ...DEFAULT_GAME_EXPORT, mode: "intro-and-loop" }, deps)).rejects.toThrow("This song has no notes to loop.");
  });

  it("names stems of intro-and-loop by channel", async () => {
    const { deps } = fakeOgg();
    const zip = await buildGameExport(sectioned(73), { ...DEFAULT_GAME_EXPORT, mode: "intro-and-loop", stems: true }, deps);
    expect(Object.keys(unzipSync(zip.bytes))).toEqual(["Theme - Lead - intro.ogg", "Theme - Lead - loop.ogg", "Theme - Drums - intro.ogg", "Theme - Drums - loop.ogg"]);
  });

  it("includes every channel: mute and solo are not part of a game export", async () => {
    const { deps, decode } = fakeOgg();
    const samples = decode((await buildGameExport(sectioned(73), { ...DEFAULT_GAME_EXPORT, normalise: false }, deps)).bytes);
    // lead and drums both sound in the first beat of the intro
    expect(samples[100]).toBeCloseTo(2 * BOX_LEVEL);
  });

  it("normalises the peak to -1 dBFS", async () => {
    const { deps, decode } = fakeOgg();
    const samples = decode((await buildGameExport(sectioned(73), DEFAULT_GAME_EXPORT, deps)).bytes);
    expect(peak(samples)).toBeCloseTo(NORMALISE_PEAK);
  });
});

describe("readGameExportOptions", () => {
  it("reads saved choices", () => {
    const saved: GameExportOptions = { mode: "fade-out", format: "wav", stems: true, normalise: false, loops: 4, fadeSeconds: 10 };
    expect(readGameExportOptions(JSON.stringify(saved))).toEqual(saved);
  });

  it("falls back to the defaults for missing, broken or unknown values", () => {
    expect(readGameExportOptions(null)).toEqual(DEFAULT_GAME_EXPORT);
    expect(readGameExportOptions("{not json")).toEqual(DEFAULT_GAME_EXPORT);
    expect(readGameExportOptions("[1]")).toEqual(DEFAULT_GAME_EXPORT);
    expect(readGameExportOptions(JSON.stringify({ mode: "x", format: "mp3", stems: "yes", normalise: 1, loops: 7, fadeSeconds: 3 }))).toEqual(DEFAULT_GAME_EXPORT);
    expect(readGameExportOptions(JSON.stringify({ format: "wav" }))).toEqual({ ...DEFAULT_GAME_EXPORT, format: "wav" });
  });
});
