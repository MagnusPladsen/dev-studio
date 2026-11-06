import { getSections, findPattern } from "@/lib/music-sections";
import type { MusicChannel, MusicTrack } from "@/types";
import { releaseSeconds } from "./music-envelope";

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
