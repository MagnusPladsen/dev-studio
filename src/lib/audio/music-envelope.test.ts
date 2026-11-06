import { describe, expect, it } from "vitest";
import { envelopeLevel, envelopeSteps, MIN_RELEASE, releaseSeconds, SILENT } from "./music-envelope";

const env = { attack: 0.1, decay: 0.2, sustain: 0.5, release: 0.3 };

describe("envelopeLevel", () => {
  it("rises in a straight line over the attack", () => {
    expect(envelopeLevel(env, 1, 0)).toBe(0);
    expect(envelopeLevel(env, 1, 0.05)).toBeCloseTo(0.5);
    expect(envelopeLevel(env, 0.3, 0.1)).toBeCloseTo(0.3);
  });

  it("falls exponentially to the sustain level over the decay, then holds", () => {
    expect(envelopeLevel(env, 1, 0.2)).toBeCloseTo(Math.SQRT1_2);
    expect(envelopeLevel(env, 1, 0.3)).toBeCloseTo(0.5);
    expect(envelopeLevel(env, 1, 5)).toBeCloseTo(0.5);
  });

  it("treats a sustain of 0 as silent, since exponential ramps can't reach 0", () => {
    expect(envelopeLevel({ ...env, sustain: 0 }, 1, 1)).toBe(SILENT);
  });
});

describe("envelopeSteps", () => {
  it("plays the whole shape for a long note and releases after it is let go", () => {
    expect(envelopeSteps(env, 1, 1)).toEqual([
      { kind: "set", value: 0, time: 0 },
      { kind: "linear", value: 1, time: 0.1 },
      { kind: "exponential", value: 0.5, time: expect.closeTo(0.3) },
      { kind: "linear", value: 0.5, time: 1 },
      { kind: "exponential", value: SILENT, time: 1.3 },
    ]);
  });

  it("lets a short note go partway up the attack, never jumping to full volume", () => {
    expect(envelopeSteps(env, 1, 0.05)).toEqual([
      { kind: "set", value: 0, time: 0 },
      { kind: "linear", value: expect.closeTo(0.5), time: 0.05 },
      { kind: "exponential", value: SILENT, time: expect.closeTo(0.35) },
    ]);
  });

  it("lets a note go partway down the decay", () => {
    const steps = envelopeSteps(env, 1, 0.2);
    expect(steps[2]).toEqual({ kind: "exponential", value: expect.closeTo(Math.SQRT1_2), time: 0.2 });
    expect(steps).toHaveLength(4);
  });

  it("starts at full volume with no attack and drops straight to sustain with no decay", () => {
    expect(envelopeSteps({ attack: 0, decay: 0, sustain: 0.4, release: 0 }, 1, 0.5)).toEqual([
      { kind: "set", value: 1, time: 0 },
      { kind: "set", value: 0.4, time: 0 },
      { kind: "linear", value: 0.4, time: 0.5 },
      { kind: "exponential", value: SILENT, time: 0.5 + MIN_RELEASE },
    ]);
  });

  it("never ends a note with a click, even with no release", () => {
    expect(releaseSeconds({ ...env, release: 0 })).toBe(MIN_RELEASE);
    expect(releaseSeconds(env)).toBe(0.3);
  });

  it("only ramps exponentially to levels above 0", () => {
    for (const held of [0.01, 0.1, 0.15, 0.3, 2]) {
      for (const step of envelopeSteps({ ...env, sustain: 0 }, 0.3, held)) {
        if (step.kind === "exponential") expect(step.value).toBeGreaterThan(0);
      }
    }
  });
});
