import type { MusicTrack } from "@/types";

export const KEY_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export type ScaleId = NonNullable<MusicTrack["scale"]>;

/** Semitones above the key note that belong to each scale. Chromatic means every note, so the lock is off. */
export const SCALES: Record<ScaleId, { label: string; steps: number[] }> = {
  chromatic: { label: "Chromatic (no lock)", steps: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
  major: { label: "Major", steps: [0, 2, 4, 5, 7, 9, 11] },
  minor: { label: "Natural minor", steps: [0, 2, 3, 5, 7, 8, 10] },
  majorPentatonic: { label: "Major pentatonic", steps: [0, 2, 4, 7, 9] },
  minorPentatonic: { label: "Minor pentatonic", steps: [0, 3, 5, 7, 10] },
  blues: { label: "Blues", steps: [0, 3, 5, 6, 7, 10] },
};

export const SCALE_IDS = Object.keys(SCALES) as ScaleId[];

export interface SongScale {
  /** The key note as a pitch class, 0 = C … 11 = B. */
  key: number;
  scale: ScaleId;
}

/** A song's key and scale. Songs saved before the lock existed have neither and are chromatic. */
export function songScale(track: Pick<MusicTrack, "key" | "scale">): SongScale {
  const scale = track.scale && track.scale in SCALES ? track.scale : "chromatic";
  const key = typeof track.key === "number" && Number.isInteger(track.key) ? ((track.key % 12) + 12) % 12 : 0;
  return { key, scale };
}

export function isScaleLocked({ scale }: SongScale): boolean {
  return scale !== "chromatic";
}

/** True when the MIDI note belongs to the key and scale. */
export function isInScale(midi: number, { key, scale }: SongScale): boolean {
  const step = (((midi - key) % 12) + 12) % 12;
  return SCALES[scale].steps.includes(step);
}
