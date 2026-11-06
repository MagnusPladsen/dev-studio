import { getSections, findPattern, songSteps, type SongStep } from "@/lib/music-sections";
import { createZip, uniqueNames } from "@/lib/zip";
import type { MusicChannel, MusicTrack } from "@/types";
import { releaseSeconds } from "./music-envelope";
import { RENDER_SAMPLE_RATE, renderSong, type RenderOptions } from "./music-render";
import { encodeOgg } from "./ogg";
import { safeFileName } from "./sfx-export";
import { encodeWav, type WavLoop } from "./wav";

/** −1 dBFS. */
export const NORMALISE_PEAK = 0.891;
export const MAX_TAIL_SECONDS = 4;

/** A Classic note fades out inside its own length, so only envelope channels ring on after the note. */
function channelRelease(channel: MusicChannel): number {
  return channel.envelope ? releaseSeconds(channel.envelope) : 0;
}

function longestOverhangBeats(track: MusicTrack): number {
  let overhang = 0;
  for (const section of getSections(track)) {
    for (const channel of track.channels) {
      const notes = findPattern(track, section, channel.id)?.notes ?? [];
      for (const note of notes) {
        if (note.start < section.length) overhang = Math.max(overhang, note.start + note.duration - section.length);
      }
    }
  }
  return overhang;
}

/** Seconds of sound that ring on past the end of the song: the longest release plus the longest note overhang. */
export function tailSeconds(track: MusicTrack): number {
  const release = Math.max(0, ...track.channels.map(channelRelease));
  const overhang = (longestOverhangBeats(track) * 60) / track.bpm;
  return Math.min(MAX_TAIL_SECONDS, release + overhang);
}

/** Adds the samples after `loopEnd` onto the start of the loop (wrapping as often as needed) and cuts the file at `loopEnd`. */
export function wrapTail(samples: Float32Array, loopStart: number, loopEnd: number): Float32Array {
  const out = samples.slice(0, loopEnd);
  const loopLength = loopEnd - loopStart;
  if (loopLength <= 0) return out;
  for (let i = loopEnd; i < samples.length; i++) {
    out[loopStart + ((i - loopEnd) % loopLength)] += samples[i];
  }
  return out;
}

/** Cosine fade from full level at `fadeStart` to silence at `fadeStart + fadeLength`; silent after. */
export function fadeOut(samples: Float32Array, fadeStart: number, fadeLength: number): Float32Array {
  const out = samples.slice();
  for (let i = fadeStart; i < out.length; i++) {
    const progress = (i - fadeStart) / fadeLength;
    out[i] = progress >= 1 ? 0 : out[i] * Math.cos((progress * Math.PI) / 2) ** 2;
  }
  return out;
}

/** One gain that brings the loudest sample across all buffers to `target`; 1 when everything is silent. */
export function peakGain(buffers: Float32Array[], target: number = NORMALISE_PEAK): number {
  let peak = 0;
  for (const buffer of buffers) {
    for (let i = 0; i < buffer.length; i++) peak = Math.max(peak, Math.abs(buffer[i]));
  }
  return peak === 0 ? 1 : target / peak;
}

export function applyGain(samples: Float32Array, gain: number): Float32Array {
  return samples.map((sample) => sample * gain);
}

export type GameExportMode = "loop" | "intro-and-loop" | "fade-out";

export interface GameExportOptions {
  mode: GameExportMode;
  format: "ogg" | "wav";
  stems: boolean;
  normalise: boolean;
  loops: 1 | 2 | 3 | 4;
  fadeSeconds: 2 | 5 | 10;
}

export const DEFAULT_GAME_EXPORT: GameExportOptions = { mode: "loop", format: "ogg", stems: false, normalise: true, loops: 2, fadeSeconds: 5 };

export interface ExportFile {
  name: string;
  bytes: Uint8Array;
}

export interface GameExportDeps {
  createContext?: RenderOptions["createContext"];
  encodeOgg?: (samples: Float32Array, sampleRate: number) => Promise<Uint8Array>;
}

/** A step no section has, so it renders silence: room for the tail to ring out. */
const SILENT_SECTION_ID = "";

function songParts(track: MusicTrack): { intro: SongStep[]; loop: SongStep[] } {
  const { steps, loopIndex } = songSteps(track, "song", "");
  return { intro: steps.slice(0, loopIndex), loop: steps.slice(loopIndex) };
}

function stepsSeconds(track: MusicTrack, steps: SongStep[]): number {
  return (steps.reduce((beats, step) => beats + step.length, 0) * 60) / track.bpm;
}

/** Seconds before the loop start section; 0 when the song loops from the start. */
export function introSeconds(track: MusicTrack): number {
  return stepsSeconds(track, songParts(track).intro);
}

export function hasIntro(track: MusicTrack): boolean {
  return introSeconds(track) > 0;
}

function toSamples(seconds: number): number {
  return Math.round(seconds * RENDER_SAMPLE_RATE);
}

/** Cuts or pads with silence to exactly `length` samples. */
function fitLength(samples: Float32Array, length: number): Float32Array {
  const out = new Float32Array(length);
  out.set(samples.subarray(0, length));
  return out;
}

type Renderer = (steps: SongStep[]) => Promise<Float32Array>;

interface RenderedPart {
  /** Added to the file name ("intro", "loop"); null for the whole song. */
  part: string | null;
  samples: Float32Array;
  loop?: WavLoop;
}

function withTail(track: MusicTrack, steps: SongStep[]): SongStep[] {
  const tailBeats = (tailSeconds(track) * track.bpm) / 60;
  return tailBeats > 0 ? [...steps, { sectionId: SILENT_SECTION_ID, length: tailBeats }] : steps;
}

async function renderIntro(track: MusicTrack, render: Renderer): Promise<Float32Array> {
  const { intro } = songParts(track);
  if (intro.length === 0) return new Float32Array(0);
  return fitLength(await render(intro), toSamples(introSeconds(track)));
}

/** One pass of the loop part with its tail added back onto its start, so it repeats without a gap or a cut. */
async function renderWrappedLoop(track: MusicTrack, render: Renderer): Promise<Float32Array> {
  const { loop } = songParts(track);
  const loopLength = toSamples(stepsSeconds(track, loop));
  const rendered = fitLength(await render(withTail(track, loop)), loopLength + toSamples(tailSeconds(track)));
  return wrapTail(rendered, 0, loopLength);
}

/** Intro and one loop pass rendered in one go, so the intro rings on into the loop; the tail wraps onto the loop start. */
async function renderLoopingFile(track: MusicTrack, render: Renderer): Promise<RenderedPart[]> {
  const { intro, loop } = songParts(track);
  const loopStart = toSamples(introSeconds(track));
  const loopEnd = loopStart + toSamples(stepsSeconds(track, loop));
  const rendered = fitLength(await render(withTail(track, [...intro, ...loop])), loopEnd + toSamples(tailSeconds(track)));
  return [{ part: null, samples: wrapTail(rendered, loopStart, loopEnd), loop: { start: loopStart, end: loopEnd - 1 } }];
}

async function renderIntroAndLoop(track: MusicTrack, render: Renderer): Promise<RenderedPart[]> {
  return [
    { part: "intro", samples: await renderIntro(track, render) },
    { part: "loop", samples: await renderWrappedLoop(track, render) },
  ];
}

async function renderFadeOut(track: MusicTrack, options: GameExportOptions, render: Renderer): Promise<RenderedPart[]> {
  const { intro, loop } = songParts(track);
  const loopSeconds = stepsSeconds(track, loop);
  const passes = options.loops + Math.ceil(options.fadeSeconds / loopSeconds);
  const steps = [...intro, ...Array.from({ length: passes }, () => loop).flat()];
  const fadeStart = toSamples(introSeconds(track)) + options.loops * toSamples(loopSeconds);
  const fadeLength = toSamples(options.fadeSeconds);
  const rendered = fitLength(await render(steps), fadeStart + fadeLength);
  return [{ part: null, samples: fadeOut(rendered, fadeStart, fadeLength) }];
}

function renderParts(track: MusicTrack, options: GameExportOptions, render: Renderer): Promise<RenderedPart[]> {
  if (options.mode === "intro-and-loop") return renderIntroAndLoop(track, render);
  if (options.mode === "fade-out") return renderFadeOut(track, options, render);
  return renderLoopingFile(track, render);
}

function rendererFor(track: MusicTrack, soundingChannel: number | null, deps: GameExportDeps): Renderer {
  const muted = track.channels.map((_, index) => soundingChannel !== null && index !== soundingChannel);
  const soloed = track.channels.map(() => false);
  return (steps) => renderSong(track, { steps, muted, soloed, createContext: deps.createContext });
}

interface NamedPart extends RenderedPart {
  name: string;
}

async function renderNamedParts(track: MusicTrack, options: GameExportOptions, deps: GameExportDeps): Promise<NamedPart[]> {
  const song = safeFileName(track.name, "song");
  if (!options.stems) {
    const parts = await renderParts(track, options, rendererFor(track, null, deps));
    return parts.map((part) => ({ ...part, name: part.part ? `${song} - ${part.part}` : song }));
  }
  const named: NamedPart[] = [];
  for (const [index, channel] of track.channels.entries()) {
    const stem = safeFileName(channel.name, "channel");
    for (const part of await renderParts(track, options, rendererFor(track, index, deps))) {
      named.push({ ...part, name: part.part ? `${song} - ${stem} - ${part.part}` : `${song} - ${stem}` });
    }
  }
  return named;
}

async function encodePart(part: NamedPart, options: GameExportOptions, deps: GameExportDeps): Promise<Uint8Array> {
  if (options.format === "wav") return new Uint8Array(encodeWav(part.samples, RENDER_SAMPLE_RATE, 16, part.loop));
  return (deps.encodeOgg ?? encodeOgg)(part.samples, RENDER_SAMPLE_RATE);
}

/**
 * Renders the song for a game engine (every channel; mute and solo are ignored) and encodes it:
 * one file, or a ZIP when there are stems or an intro and a loop file. Normalising uses one gain for every file,
 * so stems still add up to the mix.
 */
export async function buildGameExport(track: MusicTrack, options: GameExportOptions, deps: GameExportDeps = {}): Promise<ExportFile> {
  const parts = await renderNamedParts(track, options, deps);
  const gain = options.normalise ? peakGain(parts.map((part) => part.samples)) : 1;
  const extension = options.format;
  const names = uniqueNames(parts.map((part) => `${part.name}.${extension}`));
  const files: ExportFile[] = [];
  for (const [index, part] of parts.entries()) {
    files.push({ name: names[index], bytes: await encodePart({ ...part, samples: applyGain(part.samples, gain) }, options, deps) });
  }
  if (files.length === 1) return files[0];
  return { name: `${safeFileName(track.name, "song")}.zip`, bytes: createZip(files.map((file) => ({ name: file.name, data: file.bytes }))) };
}

function pick<T>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function parseObject(raw: string | null): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw ?? "");
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Saved dialog choices; anything missing or unknown falls back to the default for that choice. */
export function readGameExportOptions(raw: string | null): GameExportOptions {
  const saved = parseObject(raw);
  const defaults = DEFAULT_GAME_EXPORT;
  return {
    mode: pick(saved.mode, ["loop", "intro-and-loop", "fade-out"] as const, defaults.mode),
    format: pick(saved.format, ["ogg", "wav"] as const, defaults.format),
    stems: pick(saved.stems, [true, false] as const, defaults.stems),
    normalise: pick(saved.normalise, [true, false] as const, defaults.normalise),
    loops: pick(saved.loops, [1, 2, 3, 4] as const, defaults.loops),
    fadeSeconds: pick(saved.fadeSeconds, [2, 5, 10] as const, defaults.fadeSeconds),
  };
}
