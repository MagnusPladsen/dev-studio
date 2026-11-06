import { playbackOrder } from "@/lib/sprite-animation";
import type { SpriteExport } from "./types";

/** A file and folder name every engine accepts: lower case letters, digits and underscores. */
export function fileStem(name: string, fallback: string): string {
  const stem = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return stem || fallback;
}

/** Names made unique by adding _2, _3… to repeats; blank names become `fallback`. */
export function uniqueNames(names: string[], fallback: string): string[] {
  const seen = new Set<string>();
  return names.map((raw) => {
    const base = raw.trim() || fallback;
    let name = base;
    for (let n = 2; seen.has(name); n++) name = `${base}_${n}`;
    seen.add(name);
    return name;
  });
}

export interface SpriteAnimation {
  name: string;
  /** Sheet frame indexes in the order one loop plays them (reverse and ping-pong already applied). */
  frames: number[];
  /** Duration of each played frame in ms. */
  durations: number[];
}

/** One animation per frame tag; a sprite without tags plays all its frames as "default". */
export function spriteAnimations(sprite: Pick<SpriteExport, "durations" | "tags">): SpriteAnimation[] {
  const count = sprite.durations.length;
  const toAnimation = (name: string, frames: number[]) => ({ name, frames, durations: frames.map((i) => sprite.durations[i]) });
  if (!sprite.tags.length) return [toAnimation("default", playbackOrder(count))];
  const names = uniqueNames(
    sprite.tags.map((tag) => tag.name),
    "animation"
  );
  return sprite.tags.map((tag, i) => toAnimation(names[i], playbackOrder(count, tag)));
}

/** The most common duration, which engines that time frames relative to an FPS use as one frame. */
export function baseDuration(durations: number[]): number {
  const counts = new Map<number, number>();
  for (const ms of durations) counts.set(ms, (counts.get(ms) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? 100;
}
