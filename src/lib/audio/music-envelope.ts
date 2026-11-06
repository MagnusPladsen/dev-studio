import type { MusicEnvelope } from "@/types";

/** Exponential ramps can't reach 0, so a note counts as silent at this level (the Classic fade also ends here). */
export const SILENT = 0.001;
/** Even a release of 0 fades over this long, so the note never ends on a click. */
export const MIN_RELEASE = 0.005;

/** One gain automation event, timed from the start of the note. */
export interface EnvelopeStep {
  kind: "set" | "linear" | "exponential";
  value: number;
  time: number;
}

/** The envelope's level `t` seconds into a note that is still held. */
export function envelopeLevel(env: MusicEnvelope, peak: number, t: number): number {
  if (t < env.attack) return (peak * t) / env.attack;
  const sustain = Math.max(SILENT, env.sustain * peak);
  if (t < env.attack + env.decay) return peak * Math.pow(sustain / peak, (t - env.attack) / env.decay);
  return sustain;
}

/** How long the note sounds after it is let go. */
export function releaseSeconds(env: MusicEnvelope): number {
  return Math.max(MIN_RELEASE, env.release);
}

/**
 * Gain events for a note held for `held` seconds: rise over the attack, fall to the sustain level over the
 * decay, hold, then fade out over the release. A short note is let go wherever it is in that shape.
 */
export function envelopeSteps(env: MusicEnvelope, peak: number, held: number): EnvelopeStep[] {
  const steps: EnvelopeStep[] = [];
  if (env.attack > 0) {
    const end = Math.min(env.attack, held);
    steps.push({ kind: "set", value: 0, time: 0 }, { kind: "linear", value: envelopeLevel(env, peak, end), time: end });
  } else {
    steps.push({ kind: "set", value: peak, time: 0 });
  }
  if (held > env.attack && env.decay > 0) {
    const end = Math.min(env.attack + env.decay, held);
    steps.push({ kind: "exponential", value: Math.max(SILENT, envelopeLevel(env, peak, end)), time: end });
  } else if (held > env.attack) {
    steps.push({ kind: "set", value: envelopeLevel(env, peak, env.attack), time: env.attack });
  }
  const letGo = steps[steps.length - 1];
  if (letGo.time < held) steps.push({ kind: "linear", value: letGo.value, time: held });
  steps.push({ kind: "exponential", value: SILENT, time: held + releaseSeconds(env) });
  return steps;
}
