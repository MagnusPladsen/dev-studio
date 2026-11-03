import { describe, expect, it } from "vitest";
import { normalizeTag } from "./tags";

describe("normalizeTag", () => {
  it.each([
    ["story", "  Boss Fight ", "boss fight"],
    ["note", " #Design ", "Design"],
    ["decision", "#Saves", "Saves"],
    ["label", " Boss  Fight ", "boss-fight"],
    ["label", "   ", ""],
  ] as const)("cleans a %s tag", (kind, typed, stored) => {
    expect(normalizeTag(kind, typed)).toBe(stored);
  });
});
