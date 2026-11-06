import type { MusicNote, MusicTrack } from "@/types";
import { getSections, sectionNotes, type SongStep } from "@/lib/music-sections";
import type { MusicVoice } from "./music-instruments";

/** What the player reads on every tick, so edits made while playing are heard on the next pass. */
export interface LiveSong {
  track: MusicTrack;
  steps: SongStep[];
  /** Step the song returns to after its last step when `looping`. */
  loopIndex: number;
  muted: boolean[];
  soloed: boolean[];
  looping: boolean;
}

/** How far playback has been scheduled: beat `beat` of step `step` sounds at audio time `time`. */
export interface PlayCursor {
  time: number;
  step: number;
  beat: number;
  /** True once playback has jumped back to the loop step, so the playhead knows what lies before it. */
  wrapped?: boolean;
}

export interface DueNote {
  note: MusicNote;
  voice: MusicVoice;
  volume: number;
  /** Audio time of beat 0 of the pass this note belongs to. */
  passStart: number;
  beatDuration: number;
}

const EPSILON = 1e-9;

function notesBetween(song: LiveSong, step: SongStep, fromBeat: number, toBeat: number, passStart: number, beatDuration: number): DueNote[] {
  const section = getSections(song.track).find((candidate) => candidate.id === step.sectionId);
  if (!section) return [];
  const anySoloed = song.soloed.some(Boolean);
  return song.track.channels.flatMap((channel, index) => {
    const isMuted = song.muted[index] || (anySoloed && !song.soloed[index]);
    if (isMuted) return [];
    return sectionNotes(song.track, section, channel.id)
      .filter((note) => note.start >= fromBeat - EPSILON && note.start < toBeat - EPSILON)
      .map((note) => ({ note, voice: channel, volume: channel.volume, passStart, beatDuration }));
  });
}

/**
 * Collect the notes that start between the cursor and audio time `until`, using the song as it is now.
 * Walks the steps in order; after the last one it jumps to the loop step, or reports `ended` when looping is off.
 * A cursor past the end of a list that changed under it carries on in the loop step.
 */
export function scheduleWindow(song: LiveSong, cursor: PlayCursor, until: number): { notes: DueNote[]; cursor: PlayCursor; ended: boolean } {
  if (song.steps.length === 0) return { notes: [], cursor, ended: true };
  const beatDuration = 60 / song.track.bpm;
  const notes: DueNote[] = [];
  let { time, step, beat } = cursor;
  let wrapped = cursor.wrapped ?? false;
  if (step >= song.steps.length) {
    step = Math.min(song.loopIndex, song.steps.length - 1);
    if (beat >= song.steps[step].length) beat = 0;
  }
  while (time < until - EPSILON) {
    while (step < song.steps.length && beat >= song.steps[step].length - EPSILON) {
      step += 1;
      beat = 0;
    }
    if (step >= song.steps.length) {
      if (!song.looping) return { notes, cursor: { time, step: song.steps.length - 1, beat: song.steps[song.steps.length - 1].length }, ended: true };
      step = Math.min(song.loopIndex, song.steps.length - 1);
      wrapped = true;
    }
    const current = song.steps[step];
    const endBeat = Math.min(current.length, beat + (until - time) / beatDuration);
    notes.push(...notesBetween(song, current, beat, endBeat, time - beat * beatDuration, beatDuration));
    time += (endBeat - beat) * beatDuration;
    beat = endBeat;
  }
  const last = song.steps.length - 1;
  const ended = !song.looping && step >= last && beat >= song.steps[last].length - EPSILON;
  return { notes, cursor: { time, step, beat, ...(wrapped && { wrapped }) }, ended };
}

/** The step and beat that are sounding at audio time `now`, for the playhead. */
export function beatAt(song: LiveSong, cursor: PlayCursor, now: number): { step: number; beat: number } {
  let step = Math.min(cursor.step, song.steps.length - 1);
  let beat = cursor.beat - (cursor.time - now) / (60 / song.track.bpm);
  while (beat < 0) {
    if (step === Math.min(song.loopIndex, song.steps.length - 1) && cursor.wrapped) step = song.steps.length - 1;
    else step -= 1;
    if (step < 0) return { step: 0, beat: 0 };
    beat += song.steps[step].length;
  }
  return { step, beat: Math.min(beat, song.steps[step].length) };
}
