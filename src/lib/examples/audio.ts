import type { MusicChannel, MusicNote, MusicSection, MusicSectionLength, SfxParams } from "@/types";
import { SFX_VERSION } from "@/lib/audio/sfx-synth";
import { applyPreset, findPreset } from "@/lib/audio/music-instruments";
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

/** Name a section uses for a channel's first pattern: the song's original loop. */
const LOOP = "loop";

function channelKey(track: string, channelName: string): string {
  return `${track}-${channelName.toLowerCase()}`;
}

function patternId(ctx: ExampleContext, track: string, channelName: string, pattern: string): string {
  const key = channelKey(track, channelName);
  return ctx.id(pattern === LOOP ? `pat-${key}` : `pat-${key}-${pattern}`);
}

/**
 * `instrument` is a preset id from `INSTRUMENT_PRESETS`, or a bare wave for the Classic sound.
 * `list` is the loop pattern; `extra` adds more patterns by name (e.g. "intro") for sections to play.
 */
function channel(ctx: ExampleContext, track: string, name: string, instrument: string, volume: number, list: N[], extra: Record<string, N[]> = {}): MusicChannel {
  const preset = findPreset(instrument);
  const wave = preset?.wave ?? instrument;
  const patterns = [LOOP, ...Object.keys(extra)].map((pattern) => ({
    id: patternId(ctx, track, name, pattern),
    notes: notes(pattern === LOOP ? list : extra[pattern]),
  }));
  const made: MusicChannel = { id: ctx.id(`ch-${channelKey(track, name)}`), name, instrument: wave, volume, patterns };
  return preset ? applyPreset(made, preset.id) : made;
}

/** `play` maps a channel name to the pattern it plays here; channels left out are silent. */
function section(ctx: ExampleContext, track: string, name: string, length: MusicSectionLength, play: Record<string, string>): MusicSection {
  return {
    id: ctx.id(`sec-${track}-${name.toLowerCase()}`),
    name,
    length,
    patterns: Object.entries(play).map(([channelName, pattern]) => ({
      channelId: ctx.id(`ch-${channelKey(track, channelName)}`),
      patternId: patternId(ctx, track, channelName, pattern),
    })),
  };
}

const ALL_LOOP = { Melody: LOOP, Harmony: LOOP, Bass: LOOP, Drums: LOOP };

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
        channel(ctx, "melody", "Melody", "chip-square", 0.45, [
          [72, 0, 0.5], [74, 0.5, 0.5], [76, 1, 0.5], [72, 1.5, 0.5, 0.7], [69, 2, 1, 0.9], [67, 3, 0.5, 0.7], [69, 3.5, 0.5, 0.7],
          [72, 4, 1, 0.9], [76, 5, 0.5], [74, 5.5, 0.5, 0.7], [72, 6, 1, 0.9], [69, 7, 1],
        ], {
          // G – A – B climbs into the loop's opening C
          intro: [[67, 6, 0.5, 0.6], [69, 6.5, 0.5, 0.7], [71, 7, 1]],
          // B part over F – G: starts high and climbs back to the top
          b: [
            [77, 0, 1, 0.9], [76, 1, 0.5], [74, 1.5, 0.5, 0.7], [72, 2, 1], [69, 3, 1, 0.7],
            [71, 4, 0.5], [72, 4.5, 0.5, 0.7], [74, 5, 1, 0.9], [79, 6, 1.5, 0.9], [74, 7.5, 0.5, 0.7],
          ],
        }),
        channel(ctx, "melody", "Harmony", "triangle", 0.3, [
          [60, 0, 2, 0.6], [64, 0, 2, 0.5], [57, 2, 2, 0.6], [60, 4, 2, 0.6], [64, 4, 2, 0.5], [57, 6, 2, 0.6],
        ], {
          intro: [[53, 4, 2, 0.5], [57, 4, 2, 0.45], [55, 6, 2, 0.5], [59, 6, 2, 0.45]],
          b: [[57, 0, 2, 0.6], [60, 0, 2, 0.5], [53, 2, 2, 0.6], [59, 4, 2, 0.6], [62, 4, 2, 0.5], [55, 6, 2, 0.6]],
        }),
        channel(ctx, "melody", "Bass", "bass", 0.35, [
          [48, 0, 1], [48, 2, 1], [57, 4, 1], [57, 6, 1],
        ], {
          // the bass sets the pulse on its own, then F – G leads home to C
          intro: [[48, 0, 1], [48, 2, 1], [53, 4, 1], [55, 6, 1]],
          b: [[53, 0, 1], [53, 2, 1], [55, 4, 1], [55, 6, 1]],
        }),
        channel(ctx, "melody", "Drums", "drum-kit", 0.25, everyBar(2, [[60, 0, 0.25, 1], [60, 1, 0.25, 0.8], [60, 2, 0.25, 1], [60, 3, 0.25, 0.8]]), {
          intro: [[60, 4, 0.25, 0.8], [60, 6, 0.25, 0.8], [60, 7, 0.25, 0.9], [60, 7.5, 0.25, 1]],
        }),
      ],
      sections: [
        section(ctx, "melody", "Intro", 8, { Melody: "intro", Harmony: "intro", Bass: "intro", Drums: "intro" }),
        section(ctx, "melody", "A", 8, ALL_LOOP),
        // same drums pattern as A: linked, so a change there plays in both
        section(ctx, "melody", "B", 8, { Melody: "b", Harmony: "b", Bass: "b", Drums: LOOP }),
      ],
      loopStartId: ctx.id("sec-melody-a"),
    },
    {
      id: ctx.id("chill-loop"),
      name: "Chill Loop",
      bpm: 100,
      tags: ["loop", "menu"],
      channels: [
        channel(ctx, "chill", "Melody", "bell", 0.4, [
          [67, 0, 1, 0.7], [69, 1, 0.5, 0.6], [72, 1.5, 1.5], [71, 3, 1, 0.7], [67, 4, 1.5], [64, 5.5, 1, 0.6], [67, 6.5, 1.5, 0.7],
        ], {
          // two soft notes step up to the loop's first G
          intro: [[62, 7, 0.5, 0.5], [64, 7.5, 0.5, 0.55]],
        }),
        channel(ctx, "chill", "Harmony", "soft-pad", 0.25, [
          [55, 0, 4, 0.5], [59, 0, 4, 0.4], [53, 4, 4, 0.5], [57, 4, 4, 0.4],
        ], {
          // the loop's chords, quieter, so the pad fades in
          intro: [[55, 0, 4, 0.35], [59, 0, 4, 0.3], [53, 4, 4, 0.4], [57, 4, 4, 0.35]],
        }),
        channel(ctx, "chill", "Bass", "triangle", 0.35, [
          [48, 0, 2, 0.7], [48, 2, 2, 0.6], [53, 4, 2, 0.7], [53, 6, 2, 0.6],
        ], {
          intro: [[48, 0, 4, 0.6], [53, 4, 4, 0.6]],
        }),
        channel(ctx, "chill", "Drums", "soft-kit", 0.2, [
          [60, 0, 0.15, 0.9], [60, 2, 0.15, 0.9], [60, 4, 0.15, 0.9], [60, 6, 0.15, 0.9],
        ]),
      ],
      sections: [
        section(ctx, "chill", "Intro", 8, { Melody: "intro", Harmony: "intro", Bass: "intro" }),
        section(ctx, "chill", "Loop", 8, ALL_LOOP),
      ],
      loopStartId: ctx.id("sec-chill-loop"),
    },
    {
      // C – Am – F – G, gentle and spacious
      id: ctx.id("title-theme"),
      name: "Title Theme",
      bpm: 90,
      key: 0,
      scale: "major",
      tags: ["menu"],
      channels: [
        channel(ctx, "title", "Melody", "lead", 0.32, [
          [76, 0, 1], [79, 1, 1], [76, 2, 0.5, 0.7], [74, 2.5, 0.5, 0.7], [72, 3, 1],
          [69, 4, 1.5], [72, 5.5, 0.5, 0.7], [76, 6, 2],
          [77, 8, 1], [76, 9, 1], [74, 10, 0.5, 0.7], [72, 10.5, 0.5, 0.7], [69, 11, 1],
          [71, 12, 1], [74, 13, 1], [79, 14, 2, 0.9],
        ], {
          // G – B – D rises into the loop's opening E
          intro: [[67, 6, 0.5, 0.6], [71, 6.5, 0.5, 0.65], [74, 7, 1, 0.7]],
        }),
        channel(ctx, "title", "Harmony", "soft-pad", 0.25, [
          [60, 0, 4, 0.5], [64, 0, 4, 0.45],
          [57, 4, 4, 0.5], [60, 4, 4, 0.45],
          [53, 8, 4, 0.5], [57, 8, 4, 0.45],
          [55, 12, 4, 0.5], [59, 12, 4, 0.45],
        ], {
          // F then G: the pad waits on the way home to C
          intro: [[53, 0, 4, 0.45], [57, 0, 4, 0.4], [55, 4, 4, 0.45], [59, 4, 4, 0.4]],
        }),
        channel(ctx, "title", "Bass", "triangle", 0.35, [
          [48, 0, 2], [55, 2, 2, 0.6], [57, 4, 2], [52, 6, 2, 0.6], [53, 8, 2], [48, 10, 2, 0.6], [55, 12, 2], [50, 14, 2, 0.6],
        ], {
          intro: [[53, 0, 4, 0.5], [55, 4, 4, 0.5]],
        }),
        channel(ctx, "title", "Drums", "noise", 0.15, everyBar(4, [[50, 0, 0.25, 0.7], [84, 2, 0.15, 0.4]])),
      ],
      sections: [
        section(ctx, "title", "Intro", 8, { Melody: "intro", Harmony: "intro", Bass: "intro" }),
        section(ctx, "title", "Theme", 16, ALL_LOOP),
      ],
      loopStartId: ctx.id("sec-title-theme"),
    },
    {
      // A minor – F – G – E, eighth-note bass and a kick on every beat
      id: ctx.id("boss-battle"),
      name: "Boss Battle",
      bpm: 160,
      tags: ["battle", "loop"],
      channels: [
        channel(ctx, "boss", "Melody", "chip-square", 0.4, [
          [69, 0, 0.5], [72, 0.5, 0.5], [76, 1, 0.5], [74, 1.5, 0.5], [72, 2, 0.5], [71, 2.5, 0.5], [69, 3, 1, 0.9],
          [77, 4, 0.5], [76, 4.5, 0.5], [74, 5, 0.5], [72, 5.5, 0.5], [69, 6, 1, 0.9], [72, 7, 1],
          [79, 8, 0.5], [77, 8.5, 0.5], [76, 9, 0.5], [74, 9.5, 0.5], [71, 10, 1, 0.9], [74, 11, 1],
          [76, 12, 1, 0.9], [80, 13, 1, 0.9], [83, 14, 1, 1], [80, 15, 1, 0.9],
        ], {
          // E – G# leads straight into the loop's A
          intro: [[64, 7, 0.5, 0.85], [68, 7.5, 0.5, 0.9]],
        }),
        channel(ctx, "boss", "Harmony", "square", 0.2, [
          [60, 0, 0.5], [64, 0, 0.5], [60, 2, 0.5], [64, 2, 0.5],
          [60, 4, 0.5], [65, 4, 0.5], [60, 6, 0.5], [65, 6, 0.5],
          [59, 8, 0.5], [62, 8, 0.5], [59, 10, 0.5], [62, 10, 0.5],
          [56, 12, 0.5], [59, 12, 0.5], [56, 14, 0.5], [59, 14, 0.5],
        ], {
          // E major stabs in the second bar build tension
          intro: [[56, 4, 0.5], [59, 4, 0.5], [56, 6, 0.5], [59, 6, 0.5]],
        }),
        channel(ctx, "boss", "Bass", "bass", 0.4, [57, 53, 55, 52].flatMap((root, bar) =>
          Array.from({ length: 8 }, (_, i) => [root, bar * 4 + i * 0.5, 0.45, i % 2 ? 0.7 : 0.95] as N)
        ), {
          // A in quarters, then E in eighths, speeding up into the fight
          intro: [
            [57, 0, 0.9, 0.9], [57, 1, 0.9, 0.8], [57, 2, 0.9, 0.9], [57, 3, 0.9, 0.8],
            [52, 4, 0.45, 0.95], [52, 4.5, 0.45, 0.7], [52, 5, 0.45, 0.95], [52, 5.5, 0.45, 0.7],
            [52, 6, 0.45, 0.95], [52, 6.5, 0.45, 0.7], [52, 7, 0.45, 0.95], [52, 7.5, 0.45, 0.7],
          ],
        }),
        channel(ctx, "boss", "Drums", "drum-kit", 0.3, everyBar(4, [
          [48, 0, 0.2, 1], [84, 0.5, 0.1, 0.4], [64, 1, 0.2, 0.85], [84, 1.5, 0.1, 0.4],
          [48, 2, 0.2, 1], [84, 2.5, 0.1, 0.4], [64, 3, 0.2, 0.85], [84, 3.5, 0.1, 0.4],
        ]), {
          // two kicks, then a snare roll that gets faster and louder
          intro: [
            [48, 0, 0.2, 1], [48, 2, 0.2, 1],
            [64, 4, 0.2, 0.7], [64, 5, 0.2, 0.75], [64, 6, 0.2, 0.8], [64, 6.5, 0.2, 0.85],
            [64, 7, 0.2, 0.9], [64, 7.25, 0.2, 0.9], [64, 7.5, 0.2, 0.95], [64, 7.75, 0.2, 1],
          ],
        }),
      ],
      sections: [
        section(ctx, "boss", "Intro", 8, { Melody: "intro", Harmony: "intro", Bass: "intro", Drums: "intro" }),
        section(ctx, "boss", "Fight", 16, ALL_LOOP),
      ],
      loopStartId: ctx.id("sec-boss-fight"),
    },
  ],
};

export const audioExamples: ExampleModule[] = [soundExamples, musicExamples];
