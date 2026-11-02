import type { MusicNote, MusicTrack } from "@/types";

/** What the player reads on every tick, so edits made while playing are heard on the next pass. */
export interface LiveSong {
  track: MusicTrack;
  patternLen: number;
  muted: boolean[];
  soloed: boolean[];
  looping: boolean;
}

/** How far playback has been scheduled: beat `beat` of the loop sounds at audio time `time`. */
export interface PlayCursor {
  time: number;
  beat: number;
}

export interface DueNote {
  note: MusicNote;
  instrument: string;
  volume: number;
  /** Audio time of beat 0 of the pass this note belongs to. */
  passStart: number;
  beatDuration: number;
}

const EPSILON = 1e-9;

function notesBetween(song: LiveSong, fromBeat: number, toBeat: number, passStart: number, beatDuration: number): DueNote[] {
  const anySoloed = song.soloed.some(Boolean);
  return song.track.channels.flatMap((channel, index) => {
    const isMuted = song.muted[index] || (anySoloed && !song.soloed[index]);
    if (isMuted) return [];
    return (channel.patterns[0]?.notes ?? [])
      .filter((note) => note.start >= fromBeat - EPSILON && note.start < toBeat - EPSILON)
      .map((note) => ({ note, instrument: channel.instrument, volume: channel.volume, passStart, beatDuration }));
  });
}

/**
 * Collect the notes that start between the cursor and audio time `until`, using the song as it is now.
 * Wraps to beat 0 at the end of the loop, or reports `ended` when looping is off.
 */
export function scheduleWindow(song: LiveSong, cursor: PlayCursor, until: number): { notes: DueNote[]; cursor: PlayCursor; ended: boolean } {
  const beatDuration = 60 / song.track.bpm;
  const notes: DueNote[] = [];
  let { time, beat } = cursor;
  while (time < until - EPSILON) {
    if (beat >= song.patternLen - EPSILON) {
      if (!song.looping) return { notes, cursor: { time, beat }, ended: true };
      beat = 0;
    }
    const endBeat = Math.min(song.patternLen, beat + (until - time) / beatDuration);
    notes.push(...notesBetween(song, beat, endBeat, time - beat * beatDuration, beatDuration));
    time += (endBeat - beat) * beatDuration;
    beat = endBeat;
  }
  const ended = !song.looping && beat >= song.patternLen - EPSILON;
  return { notes, cursor: { time, beat }, ended };
}

/** The loop beat that is sounding at audio time `now`, for the playhead. */
export function beatAt(song: LiveSong, cursor: PlayCursor, now: number): number {
  const beat = cursor.beat - (cursor.time - now) / (60 / song.track.bpm);
  return ((beat % song.patternLen) + song.patternLen) % song.patternLen;
}
