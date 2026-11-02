import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { csvCell, isOverdue, today } from "@/components/board/meta";

describe("today", () => {
  const originalTimeZone = process.env.TZ;

  beforeEach(() => {
    process.env.TZ = "Pacific/Honolulu";
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env.TZ = originalTimeZone;
  });

  it("uses the local calendar day, not the UTC one", () => {
    vi.setSystemTime(new Date("2026-11-03T06:00:00Z"));
    expect(today()).toBe("2026-11-02");
  });

  it("pads single-digit months and days", () => {
    expect(today(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });

  it("does not mark an issue due today as overdue late in the evening", () => {
    vi.setSystemTime(new Date("2026-11-03T09:59:00Z"));
    expect(isOverdue({ dueDate: "2026-11-02" })).toBe(false);
    expect(isOverdue({ dueDate: "2026-11-01" })).toBe(true);
  });
});

describe("csvCell", () => {
  it("quotes values and doubles inner quotes", () => {
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell(undefined)).toBe('""');
    expect(csvCell(3)).toBe('"3"');
  });

  it.each(["=SUM(A1)", "+1", "-1+2", "@cmd"])("defuses a leading formula character in %s", (value) => {
    expect(csvCell(value)).toBe(`"'${value}"`);
  });

  it("leaves formula characters alone when they are not first", () => {
    expect(csvCell("a=b")).toBe('"a=b"');
  });

  it("keeps non-ASCII text as is", () => {
    expect(csvCell("Ærlig café")).toBe('"Ærlig café"');
  });
});
