import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Board, Issue } from "@/types";
import { DEFAULT_COLUMNS, completeSprint, csvCell, isOverdue, reopenSprint, today } from "@/components/board/meta";
import { replaceCache, storage } from "./storage";

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

describe("completeSprint", () => {
  const stamp = "2026-01-01T00:00:00.000Z";
  const board: Board = {
    id: "b",
    projectId: "p",
    name: "Task Board",
    keyPrefix: "PIP",
    nextNumber: 5,
    columns: DEFAULT_COLUMNS,
    sprints: [
      { id: "s1", name: "Sprint 1", state: "active" },
      { id: "s2", name: "Sprint 2", state: "planned" },
      { id: "s3", name: "Sprint 3", state: "planned" },
    ],
    createdAt: stamp,
    updatedAt: stamp,
  };
  const issue = (id: string, status: string, sprintId: string | null): Issue =>
    ({ id, projectId: "p", key: id, title: id, description: "", type: "task", priority: "medium", status, sprintId, labels: [], tags: [], order: 0, createdAt: stamp, updatedAt: stamp }) as Issue;
  const get = (id: string) => storage.getById("issues", id, "p")!;

  beforeEach(() => {
    replaceCache(new Map());
    storage.save("boards", board, "p");
    for (const i of [issue("done", "done", "s1"), issue("open", "in-progress", "s1"), issue("other", "todo", "s2")]) storage.save("issues", i, "p");
  });

  it("archives done issues and moves open ones to the chosen planned sprint", () => {
    const next = completeSprint("p", board, "s1", "s3");
    expect(get("done")).toMatchObject({ archived: true, sprintId: "s1" });
    expect(get("open")).toMatchObject({ sprintId: "s3" });
    expect(get("open").archived).toBeUndefined();
    expect(get("other").sprintId).toBe("s2");
    expect(next.sprints.find((s) => s.id === "s1")).toMatchObject({ state: "closed" });
    expect(next.sprints.find((s) => s.id === "s1")?.closedAt).toBeTruthy();
  });

  it("moves open issues to the backlog when no sprint is chosen", () => {
    completeSprint("p", board, "s1", null);
    expect(get("open").sprintId).toBeNull();
  });

  it("reopens a closed sprint as planned", () => {
    const closed = completeSprint("p", board, "s1", null);
    const reopened = reopenSprint("p", closed, "s1");
    expect(reopened.sprints.find((s) => s.id === "s1")).toEqual({ id: "s1", name: "Sprint 1", state: "planned", closedAt: undefined });
  });
});
