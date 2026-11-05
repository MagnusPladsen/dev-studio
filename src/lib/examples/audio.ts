import type { MusicChannel, MusicNote, SfxParams } from "@/types";
import { SFX_VERSION } from "@/lib/audio/sfx-synth";
import type { ExampleContext, ExampleModule } from "./types";

// ── Sound effects ─────────────────────────────────────────────────────

const BASE: SfxParams = {
  waveType: "square",
  frequency: 440,
  frequencySlide: 0,
  repeatSpeed: 0,
  sustainTime: 0.1,
  decayTime: 0.2,
  attackTime: 0,
  hpFilterCutoff: 0,
  lpFilterCutoff: 1,
  lpFilterResonance: 0,
  volume: 0.5,
  vibratoDepth: 0,
  vibratoSpeed: 0,
  version: SFX_VERSION,
};

// Slides are for the version 2 synth (octaves, curved); each ends on the same pitch as the original straight slide.
const SOUNDS: { slug: string; name: string; tags: string[]; params: Partial<SfxParams> }[] = [
  // short upward chirp: the classic platformer hop
  { slug: "jump", name: "Jump", tags: ["player"], params: { waveType: "square", frequency: 300, frequencySlide: 0.23, sustainTime: 0.08, decayTime: 0.2 } },
  // bright and quick so it can play many times in a row
  { slug: "coin", name: "Coin pickup", tags: ["pickup"], params: { waveType: "square", frequency: 900, frequencySlide: 0.11, sustainTime: 0.05, decayTime: 0.15, volume: 0.4 } },
  { slug: "laser", name: "Laser", tags: ["weapon"], params: { waveType: "sawtooth", frequency: 1100, frequencySlide: -0.16, sustainTime: 0.08, decayTime: 0.18 } },
  // low filtered noise with a long tail
  {
    slug: "explosion",
    name: "Explosion",
    tags: ["impact"],
    params: { waveType: "noise", frequency: 120, frequencySlide: -0.19, sustainTime: 0.25, decayTime: 0.6, lpFilterCutoff: 0.4, lpFilterResonance: 0.2, volume: 0.8 },
  },
  // falling pitch reads as "ouch"
  { slug: "hurt", name: "Hurt", tags: ["player"], params: { waveType: "square", frequency: 420, frequencySlide: -0.46, sustainTime: 0.04, decayTime: 0.18, hpFilterCutoff: 0.1, volume: 0.55 } },
  // long rising sweep with a little wobble
  {
    slug: "powerup",
    name: "Power-up",
    tags: ["pickup"],
    params: { waveType: "square", frequency: 330, frequencySlide: 0.39, sustainTime: 0.14, decayTime: 0.35, vibratoDepth: 0.03, vibratoSpeed: 12, volume: 0.45 },
  },
  { slug: "select", name: "Menu select", tags: ["ui"], params: { waveType: "square", frequency: 740, frequencySlide: 0.07, sustainTime: 0.04, decayTime: 0.08, lpFilterCutoff: 0.8, volume: 0.35 } },
  // slow low sawtooth with vibrato sounds like a creaky hinge
  {
    slug: "door",
    name: "Door open",
    tags: ["world"],
    params: { waveType: "sawtooth", frequency: 70, frequencySlide: 0.14, sustainTime: 0.3, decayTime: 0.25, vibratoDepth: 0.15, vibratoSpeed: 9, lpFilterCutoff: 0.35, volume: 0.6 },
  },
];

const soundExamples: ExampleModule = {
  collection: "sounds",
  build: ({ id }) =>
    SOUNDS.map((s) => ({
      id: id(s.slug),
      name: s.name,
      tags: s.tags,
      params: { ...BASE, ...s.params },
    })),
};

// ── Music ─────────────────────────────────────────────────────────────
// Notes are [pitch (MIDI), start beat, length in beats, velocity]. The editor shows C3 (48) to C6 (84).

type N = [number, number, number, number?];

function notes(list: N[]): MusicNote[] {
  return list.map(([pitch, start, duration, velocity = 0.8]) => ({ pitch, start, duration, velocity }));
}

function channel(ctx: ExampleContext, track: string, name: string, instrument: string, volume: number, list: N[]): MusicChannel {
  const key = `${track}-${name.toLowerCase()}`;
  return { id: ctx.id(`ch-${key}`), name, instrument, volume, patterns: [{ id: ctx.id(`pat-${key}`), notes: notes(list) }] };
}

/** Repeats a one-bar pattern (4 beats) across `bars` bars. */
function everyBar(bars: number, bar: N[]): N[] {
  return Array.from({ length: bars }, (_, b) => bar.map(([p, s, d, v]) => [p, s + b * 4, d, v] as N)).flat();
}

const musicExamples: ExampleModule = {
  collection: "music",
  legacyNames: ["Example – 8-Bit Melody", "Example – Chill Loop"],
  build: (ctx) => [
    {
      id: ctx.id("melody"),
      name: "Overworld",
      bpm: 140,
      tags: ["loop", "level"],
      channels: [
        channel(ctx, "melody", "Melody", "square", 0.45, [
          [72, 0, 0.5], [74, 0.5, 0.5], [76, 1, 0.5], [72, 1.5, 0.5, 0.7], [69, 2, 1, 0.9], [67, 3, 0.5, 0.7], [69, 3.5, 0.5, 0.7],
          [72, 4, 1, 0.9], [76, 5, 0.5], [74, 5.5, 0.5, 0.7], [72, 6, 1, 0.9], [69, 7, 1],
        ]),
        channel(ctx, "melody", "Harmony", "triangle", 0.3, [
          [60, 0, 2, 0.6], [64, 0, 2, 0.5], [57, 2, 2, 0.6], [60, 4, 2, 0.6], [64, 4, 2, 0.5], [57, 6, 2, 0.6],
        ]),
        channel(ctx, "melody", "Bass", "sawtooth", 0.35, [
          [48, 0, 1], [48, 2, 1], [57, 4, 1], [57, 6, 1],
        ]),
        channel(ctx, "melody", "Drums", "noise", 0.25, everyBar(2, [[60, 0, 0.25, 1], [60, 1, 0.25, 0.8], [60, 2, 0.25, 1], [60, 3, 0.25, 0.8]])),
      ],
    },
    {
      id: ctx.id("chill-loop"),
      name: "Chill Loop",
      bpm: 100,
      tags: ["loop", "menu"],
      channels: [
        channel(ctx, "chill", "Melody", "sine", 0.4, [
          [67, 0, 1, 0.7], [69, 1, 0.5, 0.6], [72, 1.5, 1.5], [71, 3, 1, 0.7], [67, 4, 1.5], [64, 5.5, 1, 0.6], [67, 6.5, 1.5, 0.7],
        ]),
        channel(ctx, "chill", "Harmony", "triangle", 0.25, [
          [55, 0, 4, 0.5], [59, 0, 4, 0.4], [53, 4, 4, 0.5], [57, 4, 4, 0.4],
        ]),
        channel(ctx, "chill", "Bass", "triangle", 0.35, [
          [48, 0, 2, 0.7], [48, 2, 2, 0.6], [53, 4, 2, 0.7], [53, 6, 2, 0.6],
        ]),
        channel(ctx, "chill", "Drums", "noise", 0.2, [
          [60, 0, 0.15, 0.9], [60, 2, 0.15, 0.9], [60, 4, 0.15, 0.9], [60, 6, 0.15, 0.9],
        ]),
      ],
    },
    {
      // C – Am – F – G, gentle and spacious
      id: ctx.id("title-theme"),
      name: "Title Theme",
      bpm: 90,
      tags: ["menu"],
      channels: [
        channel(ctx, "title", "Melody", "square", 0.32, [
          [76, 0, 1], [79, 1, 1], [76, 2, 0.5, 0.7], [74, 2.5, 0.5, 0.7], [72, 3, 1],
          [69, 4, 1.5], [72, 5.5, 0.5, 0.7], [76, 6, 2],
          [77, 8, 1], [76, 9, 1], [74, 10, 0.5, 0.7], [72, 10.5, 0.5, 0.7], [69, 11, 1],
          [71, 12, 1], [74, 13, 1], [79, 14, 2, 0.9],
        ]),
        channel(ctx, "title", "Harmony", "triangle", 0.25, [
          [60, 0, 4, 0.5], [64, 0, 4, 0.45],
          [57, 4, 4, 0.5], [60, 4, 4, 0.45],
          [53, 8, 4, 0.5], [57, 8, 4, 0.45],
          [55, 12, 4, 0.5], [59, 12, 4, 0.45],
        ]),
        channel(ctx, "title", "Bass", "triangle", 0.35, [
          [48, 0, 2], [55, 2, 2, 0.6], [57, 4, 2], [52, 6, 2, 0.6], [53, 8, 2], [48, 10, 2, 0.6], [55, 12, 2], [50, 14, 2, 0.6],
        ]),
        channel(ctx, "title", "Drums", "noise", 0.15, everyBar(4, [[50, 0, 0.25, 0.7], [84, 2, 0.15, 0.4]])),
      ],
    },
    {
      // A minor – F – G – E, eighth-note bass and a kick on every beat
      id: ctx.id("boss-battle"),
      name: "Boss Battle",
      bpm: 160,
      tags: ["battle", "loop"],
      channels: [
        channel(ctx, "boss", "Melody", "square", 0.4, [
          [69, 0, 0.5], [72, 0.5, 0.5], [76, 1, 0.5], [74, 1.5, 0.5], [72, 2, 0.5], [71, 2.5, 0.5], [69, 3, 1, 0.9],
          [77, 4, 0.5], [76, 4.5, 0.5], [74, 5, 0.5], [72, 5.5, 0.5], [69, 6, 1, 0.9], [72, 7, 1],
          [79, 8, 0.5], [77, 8.5, 0.5], [76, 9, 0.5], [74, 9.5, 0.5], [71, 10, 1, 0.9], [74, 11, 1],
          [76, 12, 1, 0.9], [80, 13, 1, 0.9], [83, 14, 1, 1], [80, 15, 1, 0.9],
        ]),
        channel(ctx, "boss", "Harmony", "square", 0.2, [
          [60, 0, 0.5], [64, 0, 0.5], [60, 2, 0.5], [64, 2, 0.5],
          [60, 4, 0.5], [65, 4, 0.5], [60, 6, 0.5], [65, 6, 0.5],
          [59, 8, 0.5], [62, 8, 0.5], [59, 10, 0.5], [62, 10, 0.5],
          [56, 12, 0.5], [59, 12, 0.5], [56, 14, 0.5], [59, 14, 0.5],
        ]),
        channel(ctx, "boss", "Bass", "sawtooth", 0.4, [57, 53, 55, 52].flatMap((root, bar) =>
          Array.from({ length: 8 }, (_, i) => [root, bar * 4 + i * 0.5, 0.45, i % 2 ? 0.7 : 0.95] as N)
        )),
        channel(ctx, "boss", "Drums", "noise", 0.3, everyBar(4, [
          [48, 0, 0.2, 1], [84, 0.5, 0.1, 0.4], [64, 1, 0.2, 0.85], [84, 1.5, 0.1, 0.4],
          [48, 2, 0.2, 1], [84, 2.5, 0.1, 0.4], [64, 3, 0.2, 0.85], [84, 3.5, 0.1, 0.4],
        ])),
      ],
    },
  ],
};

export const audioExamples: ExampleModule[] = [soundExamples, musicExamples];
