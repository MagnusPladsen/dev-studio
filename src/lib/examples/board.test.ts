import { beforeEach, describe, expect, it } from "vitest";
import type { Issue } from "@/types";
import { isOverdue } from "@/components/board/meta";
import { replaceCache, storage } from "../storage";
import { boardExamples, removeExampleSprints } from "./board";
import { devStudioExamples } from "./dev-studio";

const ctx = { projectId: "p", id: (slug: string) => `p--ex--${slug}` };
const now = "2026-01-01T00:00:00.000Z";

describe.each([
  ["GameDev Studio", boardExamples],
  ["Dev Studio", devStudioExamples],
])("%s example issues", (_, modules) => {
  const issuesModule = modules.find((m) => m.collection === "issues")!;

  beforeEach(() => {
    replaceCache(new Map());
    storage.save("projects", { id: "p", name: "Pip's Quest", createdAt: now, updatedAt: now } as never);
  });

  const build = () => issuesModule.build(ctx) as unknown as Issue[];
  const board = () => storage.getAll("boards", "p")[0];

  it("sit in an active sprint, a planned sprint and the backlog", () => {
    const issues = build();
    const sprints = board().sprints;
    expect(sprints.map((s) => s.state)).toEqual(["active", "planned"]);
    expect(sprints.every((s) => s.example)).toBe(true);
    const active = sprints[0];
    expect(active.startDate! <= active.endDate!).toBe(true);
    for (const sprint of sprints) expect(issues.some((i) => i.sprintId === sprint.id)).toBe(true);
    expect(issues.some((i) => i.sprintId === null)).toBe(true);
    for (const i of issues) if (i.sprintId) expect(sprints.map((s) => s.id)).toContain(i.sprintId);
  });

  it("have due dates, one of them overdue", () => {
    const due = build().filter((i) => i.dueDate);
    expect(due.length).toBeGreaterThanOrEqual(2);
    expect(due.filter((i) => isOverdue(i))).toHaveLength(1);
  });

  it("don't add sprints twice, nor a second active sprint", () => {
    build();
    build();
    expect(board().sprints).toHaveLength(2);
    replaceCache(new Map());
    storage.save("boards", { id: "b", projectId: "p", name: "Task Board", keyPrefix: "PIP", nextNumber: 1, columns: [], sprints: [{ id: "mine", name: "Mine", state: "active" }], createdAt: now, updatedAt: now }, "p");
    build();
    expect(board().sprints.filter((s) => s.state === "active").map((s) => s.id)).toEqual(["mine"]);
  });

  it("take their sprints away when removed, moving your own issues to the backlog", () => {
    const [first] = build();
    storage.save("issues", { ...first, id: "mine", sprintId: first.sprintId }, "p");
    removeExampleSprints("p");
    expect(board().sprints).toEqual([]);
    expect(storage.getById("issues", "mine", "p")?.sprintId).toBeNull();
  });
});
