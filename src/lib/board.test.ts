import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Board, Issue } from "@/types";
import { csvCell } from "@/components/board/meta";
import {
  DEFAULT_COLUMNS,
  activeSprintOf,
  addColumn,
  archiveDoneIssues,
  byOrder,
  clampPoints,
  completeSprint,
  createDefaultBoard,
  createIssue,
  createSprint,
  deleteSprint,
  isOverdue,
  issueKeyPrefix,
  issueNumber,
  issueTypeLabel,
  issueTypesFor,
  issuesOnBoard,
  moveIssueToColumn,
  moveIssueToSprint,
  patchColumn,
  removeColumn,
  reopenSprint,
  restoreIssue,
  setColumnCategory,
  shiftColumn,
  startSprint,
  today,
  withLabel,
  withoutLabel,
} from "./board";
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

describe("board logic", () => {
  const P = "p";
  const now = "2026-01-01T00:00:00.000Z";
  const issues = () => storage.getAll("issues", P);
  const byKey = (key: string) => issues().find((i) => i.key === key)!;
  const laneKeys = (filter: (i: Issue) => boolean) => issues().filter(filter).sort(byOrder).map((i) => i.key);
  let board: Board;

  beforeEach(() => {
    replaceCache(new Map());
    storage.save("projects", { id: P, name: "Pip's Quest", description: "", createdAt: now, updatedAt: now });
    board = createDefaultBoard(P);
  });

  const add = (title: string, fields: Partial<Issue> = {}) => {
    const created = createIssue(P, board, { title, ...fields });
    board = created.board;
    return created.issue;
  };

  describe("keys", () => {
    it("derives the prefix from the project name", () => {
      expect(board.keyPrefix).toBe("PIP");
      expect(issueKeyPrefix("42!")).toBe("ISS");
      expect(issueNumber("PIP-12")).toBe(12);
      expect(issueNumber("PIP-x")).toBe(0);
    });

    it("numbers issues one after another and moves nextNumber on", () => {
      expect([add("a").key, add("b").key, add("c").key]).toEqual(["PIP-1", "PIP-2", "PIP-3"]);
      expect(storage.getAll("boards", P)[0].nextNumber).toBe(4);
    });

    it("continues after the highest existing key, even when nextNumber lags behind", () => {
      add("a");
      storage.save("issues", { ...byKey("PIP-1"), id: "imported", key: "PIP-40" }, P);
      expect(add("b").key).toBe("PIP-41");
    });

    it("never reuses the number of a deleted issue", () => {
      add("a");
      const second = add("b");
      storage.delete("issues", second.id, P);
      expect(add("c").key).toBe("PIP-3");
    });
  });

  describe("create", () => {
    it("puts a new issue last in the first column, in the backlog", () => {
      const first = add("a");
      const second = add("b");
      expect(first).toMatchObject({ status: "todo", sprintId: null, type: "task", priority: "medium", order: 1000, resolvedAt: undefined });
      expect(second.order).toBe(2000);
    });

    it("stamps resolvedAt when created straight into a Done column", () => {
      expect(add("a", { status: "done" }).resolvedAt).toBeTruthy();
    });
  });

  describe("moves", () => {
    it("moves an issue to another column before a given card and renumbers the lane", () => {
      const a = add("a", { status: "testing" });
      const b = add("b", { status: "testing" });
      const c = add("c");
      moveIssueToColumn(P, board, c.id, "testing", b.id);
      expect(laneKeys((i) => i.status === "testing")).toEqual([a.key, c.key, b.key]);
      expect(issues().filter((i) => i.status === "testing").map((i) => i.order).sort()).toEqual([1000, 2000, 3000]);
    });

    it("drops an issue at the bottom when there is no card to go before", () => {
      const a = add("a", { status: "testing" });
      const b = add("b");
      moveIssueToColumn(P, board, b.id, "testing");
      expect(laneKeys((i) => i.status === "testing")).toEqual([a.key, b.key]);
    });

    it("keeps resolvedAt in step with Done columns", () => {
      const a = add("a");
      moveIssueToColumn(P, board, a.id, "done");
      const resolvedAt = byKey(a.key).resolvedAt;
      expect(resolvedAt).toBeTruthy();
      moveIssueToColumn(P, board, a.id, "done");
      expect(byKey(a.key).resolvedAt).toBe(resolvedAt);
      moveIssueToColumn(P, board, a.id, "todo");
      expect(byKey(a.key).resolvedAt).toBeUndefined();
    });

    it("only counts the active sprint's issues as the board lane", () => {
      const { sprint, board: withSprint } = createSprint(P, board);
      const started = startSprint(P, withSprint, sprint.id);
      if (!started.ok) throw new Error(started.error);
      board = started.board;
      const outside = add("outside");
      const inside = add("inside", { sprintId: sprint.id });
      expect(issuesOnBoard(board, issues()).map((i) => i.key)).toEqual([inside.key]);
      moveIssueToColumn(P, board, inside.id, "testing");
      expect(byKey(outside.key).order).toBe(1000);
    });

    it("moves an issue into a sprint lane and back to the backlog", () => {
      const { sprint, board: withSprint } = createSprint(P, board);
      board = withSprint;
      const a = add("a");
      const b = add("b");
      moveIssueToSprint(P, board, b.id, sprint.id);
      moveIssueToSprint(P, board, a.id, sprint.id, b.id);
      expect(laneKeys((i) => i.sprintId === sprint.id)).toEqual([a.key, b.key]);
      moveIssueToSprint(P, board, a.id, null);
      expect(byKey(a.key).sprintId).toBeNull();
    });
  });

  describe("archive", () => {
    it("archives done issues on the board and restores one", () => {
      const done = add("done", { status: "done" });
      add("open");
      expect(archiveDoneIssues(P, board).map((i) => i.key)).toEqual([done.key]);
      expect(byKey(done.key).archived).toBe(true);
      restoreIssue(P, board, byKey(done.key));
      expect(byKey(done.key).archived).toBe(false);
    });
  });

  describe("columns", () => {
    it("adds a column before Done in an unused colour", () => {
      const next = addColumn(P, board);
      expect(next.columns.map((c) => c.name)).toEqual(["To Do", "In Progress", "Testing", "New column", "Done"]);
      expect(next.columns[3]).toMatchObject({ category: "doing", color: "#a78bfa" });
    });

    it("keeps one Done column", () => {
      expect(setColumnCategory(P, board, "done", "doing")).toEqual({ ok: false, error: "Keep at least one Done column, so finished work can be counted." });
      expect(removeColumn(P, board, "done")).toEqual({ ok: false, error: "Keep at least one Done column." });
    });

    it("updates resolvedAt when a column starts or stops counting as done", () => {
      const a = add("a", { status: "testing" });
      const change = setColumnCategory(P, board, "testing", "done");
      expect(change.ok).toBe(true);
      expect(byKey(a.key).resolvedAt).toBeTruthy();
      if (change.ok) setColumnCategory(P, change.board, "testing", "doing");
      expect(byKey(a.key).resolvedAt).toBeUndefined();
    });

    it("moves a removed column's issues to the chosen column", () => {
      const a = add("a", { status: "testing" });
      expect(removeColumn(P, board, "testing")).toEqual({ ok: false, error: "Choose where its issues should go." });
      const change = removeColumn(P, board, "testing", "done");
      expect(change.ok && change.board.columns.map((c) => c.id)).toEqual(["todo", "in-progress", "done"]);
      expect(byKey(a.key)).toMatchObject({ status: "done" });
      expect(byKey(a.key).resolvedAt).toBeTruthy();
    });

    it("shifts a column and stops at either end", () => {
      expect(shiftColumn(P, board, "todo", 1).columns.map((c) => c.id)).toEqual(["in-progress", "todo", "testing", "done"]);
      expect(shiftColumn(P, board, "todo", -1)).toBe(board);
      expect(patchColumn(P, board, "todo", { name: "Ideas" }).columns[0].name).toBe("Ideas");
    });
  });

  describe("sprints", () => {
    it("names new sprints in order and starts one for two weeks", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 10, 3, 12));
      const first = createSprint(P, board);
      const second = createSprint(P, first.board, { goal: "Ship it" });
      expect([first.sprint.name, second.sprint.name]).toEqual(["Sprint 1", "Sprint 2"]);
      expect(second.sprint).toMatchObject({ goal: "Ship it", state: "planned" });
      const started = startSprint(P, second.board, first.sprint.id);
      expect(started.ok && activeSprintOf(started.board)).toMatchObject({ id: first.sprint.id, startDate: "2026-11-03", endDate: "2026-11-16" });
      vi.useRealTimers();
    });

    it("runs one sprint at a time", () => {
      const first = createSprint(P, board);
      const second = createSprint(P, first.board);
      const started = startSprint(P, second.board, first.sprint.id);
      if (!started.ok) throw new Error(started.error);
      expect(startSprint(P, started.board, second.sprint.id)).toEqual({ ok: false, error: 'Complete "Sprint 1" first: one sprint runs at a time.' });
    });

    it("sends a deleted sprint's issues to the backlog", () => {
      const { sprint, board: withSprint } = createSprint(P, board);
      board = withSprint;
      const a = add("a", { sprintId: sprint.id });
      expect(deleteSprint(P, board, sprint.id).sprints).toEqual([]);
      expect(byKey(a.key).sprintId).toBeNull();
    });

    it("completes a sprint into the next one, then reopens it", () => {
      const first = createSprint(P, board);
      const second = createSprint(P, first.board);
      board = second.board;
      const done = add("done", { status: "done", sprintId: first.sprint.id });
      const open = add("open", { sprintId: first.sprint.id });
      const closed = completeSprint(P, board, first.sprint.id, second.sprint.id);
      expect(byKey(done.key)).toMatchObject({ archived: true, sprintId: first.sprint.id });
      expect(byKey(open.key).sprintId).toBe(second.sprint.id);
      expect(reopenSprint(P, closed, first.sprint.id).sprints[0].state).toBe("planned");
    });
  });

  describe("labels and points", () => {
    it("normalises a typed label and ignores duplicates and blanks", () => {
      const labels = withLabel([], "  Boss Fight ");
      expect(labels).toEqual(["boss-fight"]);
      expect(withLabel(labels, "boss fight")).toBe(labels);
      expect(withLabel(labels, "   ")).toBe(labels);
      expect(withoutLabel(labels, "boss-fight")).toEqual([]);
    });

    it("never stores negative points", () => {
      expect(clampPoints(-3)).toBe(0);
      expect(clampPoints(5)).toBe(5);
    });
  });

  describe("per app", () => {
    it("offers each app's issue types and labels them in that app's words", () => {
      expect(issueTypesFor("dev-studio")).toContain("chore");
      expect(issueTypesFor("gamedev-studio")).toContain("art");
      expect(issueTypeLabel("bug", "dev-studio")).toBe("Bug");
      expect(issueTypeLabel("epic", "dev-studio")).toBe("epic");
    });
  });
});
