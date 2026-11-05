import type { MusicTrack } from "@/types";
import { scheduleWindow, type LiveSong } from "./music-scheduler";
import { scheduleNote } from "./music-synth";

export const RENDER_SAMPLE_RATE = 44100;

export interface RenderOptions {
  patternLen: number;
  muted: boolean[];
  soloed: boolean[];
  sampleRate?: number;
  /** Swappable so tests can render without a browser. */
  createContext?: (length: number, sampleRate: number) => BaseAudioContext & { startRendering(): Promise<AudioBuffer> };
}

/** Samples in one pass of the loop. */
export function loopSampleCount(track: MusicTrack, patternLen: number, sampleRate: number): number {
  return Math.ceil(sampleRate * patternLen * (60 / track.bpm));
}

/**
 * One pass of the loop rendered offline through the same scheduler and synth as Play,
 * so the file sounds like what was heard in the editor.
 */
export async function renderLoop(track: MusicTrack, options: RenderOptions): Promise<Float32Array> {
  const sampleRate = options.sampleRate ?? RENDER_SAMPLE_RATE;
  const length = loopSampleCount(track, options.patternLen, sampleRate);
  const createContext = options.createContext ?? ((frames, rate) => new OfflineAudioContext(1, frames, rate));
  const ctx = createContext(length, sampleRate);
  const song: LiveSong = { track, patternLen: options.patternLen, muted: options.muted, soloed: options.soloed, looping: false };
  const { notes } = scheduleWindow(song, { time: 0, beat: 0 }, length / sampleRate);
  for (const due of notes) {
    scheduleNote(ctx, ctx.destination, due.note, due.instrument, due.volume, due.passStart, due.beatDuration);
  }
  const rendered = await ctx.startRendering();
  return rendered.getChannelData(0);
}
