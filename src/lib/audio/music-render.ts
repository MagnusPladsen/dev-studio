import type { MusicTrack } from "@/types";
import type { SongStep } from "@/lib/music-sections";
import { scheduleWindow, type LiveSong } from "./music-scheduler";
import { scheduleNote } from "./music-synth";

export const RENDER_SAMPLE_RATE = 44100;

export interface RenderOptions {
  steps: SongStep[];
  muted: boolean[];
  soloed: boolean[];
  sampleRate?: number;
  /** Swappable so tests can render without a browser. */
  createContext?: (length: number, sampleRate: number) => BaseAudioContext & { startRendering(): Promise<AudioBuffer> };
}

/** Samples in one pass through every step. */
export function songSampleCount(track: MusicTrack, steps: SongStep[], sampleRate: number): number {
  const beats = steps.reduce((total, step) => total + step.length, 0);
  return Math.ceil(sampleRate * beats * (60 / track.bpm));
}

/**
 * One pass through the song steps rendered offline through the same scheduler and synth as Play,
 * so the file sounds like what was heard in the editor.
 */
export async function renderSong(track: MusicTrack, options: RenderOptions): Promise<Float32Array> {
  const sampleRate = options.sampleRate ?? RENDER_SAMPLE_RATE;
  const length = songSampleCount(track, options.steps, sampleRate);
  const createContext = options.createContext ?? ((frames, rate) => new OfflineAudioContext(1, frames, rate));
  const ctx = createContext(length, sampleRate);
  const song: LiveSong = { track, steps: options.steps, loopIndex: 0, muted: options.muted, soloed: options.soloed, looping: false };
  const { notes } = scheduleWindow(song, { time: 0, step: 0, beat: 0 }, length / sampleRate);
  for (const due of notes) {
    scheduleNote(ctx, ctx.destination, due.note, due.voice, due.volume, due.passStart, due.beatDuration);
  }
  const rendered = await ctx.startRendering();
  return rendered.getChannelData(0);
}
