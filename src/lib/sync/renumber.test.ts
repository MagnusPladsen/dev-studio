import { describe, expect, it } from "vitest";
import { nextFreeIssueKey, nextFreeNumber } from "./renumber";

describe("renumbering after a clash", () => {
  it("takes the next free issue number with the same prefix", () => {
    expect(nextFreeIssueKey("TIDE-4", ["TIDE-1", "TIDE-4", "TIDE-30", "PIP-99", "TIDE-x"])).toBe("TIDE-31");
    expect(nextFreeIssueKey("MY-APP-2", ["MY-APP-2", "MY-APP-3"])).toBe("MY-APP-4");
    expect(nextFreeIssueKey("TIDE", [])).toBe("TIDE-1");
  });

  it("takes the next free ADR number", () => {
    expect(nextFreeNumber([1, "2", 5, null, "x"])).toBe(6);
    expect(nextFreeNumber([])).toBe(1);
  });
});
