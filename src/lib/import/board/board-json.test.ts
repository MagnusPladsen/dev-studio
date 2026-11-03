import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Board, Issue } from "@/types";
import { runImporter } from "@/lib/import";
import { textFile } from "@/lib/import/test-helpers";
import { boardJsonImporter } from "./board-json";
import { mergeIntoBoard } from "./merge";
import type { IssueDraft } from "./types";

const exported = readFileSync(new URL("./fixtures/board-export.json", import.meta.url), "utf8");
const ALL_TYPES: Issue["type"][] = ["feature", "bug", "task", "art", "audio", "design", "writing", "chore", "docs"];

const board: Board = {
  id: "b",
  projectId: "p",
  name: "Task Board",
  keyPrefix: "PIP",
  nextNumber: 8,
  columns: [
    { id: "todo", name: "To Do", color: "#94a3b8", category: "todo" },
    { id: "in-progress", name: "In Progress", color: "#60a5fa", category: "doing" },
    { id: "done", name: "Done", color: "#34d399", category: "done" },
  ],
  sprints: [{ id: "now", name: "Sprint 9", state: "active" }],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};
const existing = [{ id: "e", projectId: "p", key: "PIP-11", title: "x", description: "", type: "task", priority: "medium", status: "todo", sprintId: null, labels: [], order: 3000, tags: [], createdAt: "", updatedAt: "" }] satisfies Issue[];

async function importBoard(): Promise<IssueDraft[]> {
  const outcome = await runImporter(boardJsonImporter, textFile(exported, "old-board.json"));
  if (!outcome.ok) throw new Error(outcome.message);
  return outcome.result.items;
}

describe("Board JSON import", () => {
  it("reads issues in key order with their column, sprint and fields", async () => {
    const items = await importBoard();
    expect(items.map((item) => item.title)).toEqual(["Main menu layout", "Options screen", "Menu music loops badly"]);
    expect(items[0]).toMatchObject({ type: "feature", points: 3, archived: true, labels: ["ui"], status: { name: "Done", addIfMissing: true }, sprint: { name: "Sprint 1", state: "closed" } });
    expect(items[2]).toMatchObject({ status: { name: "Blocked", category: "doing", color: "#f472b6" }, sprint: { name: "Sprint 2", state: "active", goal: "Playable menu" } });
  });

  it("merges into the current board: new keys after the highest, missing columns and sprints added", async () => {
    const merged = mergeIntoBoard(board, existing, await importBoard(), ALL_TYPES, "2026-02-01T00:00:00.000Z");
    expect(merged.issues.map((issue) => issue.key)).toEqual(["PIP-12", "PIP-13", "PIP-14"]);
    expect(merged.board.nextNumber).toBe(15);
    expect(merged.board.columns.map((column) => column.name)).toEqual(["To Do", "In Progress", "Done", "Blocked"]);
    expect(merged.board.sprints.map((sprint) => [sprint.name, sprint.state])).toEqual([["Sprint 9", "active"], ["Sprint 1", "closed"], ["Sprint 2", "planned"]]);
    const [layout, options, music] = merged.issues;
    expect(layout).toMatchObject({ status: "done", resolvedAt: "2026-02-01T00:00:00.000Z", archived: true, projectId: "p" });
    expect(options).toMatchObject({ status: "todo", order: 4000, dueDate: "2026-03-01", sprintId: null });
    expect(music.status).toBe("blocked");
    expect(music.sprintId).toBe(merged.board.sprints[2].id);
    expect(merged.warnings).toEqual(["Added 1 column: Blocked", "Added 2 sprints: Sprint 1, Sprint 2"]);
  });

  it("sends CSV statuses to a column of their kind and turns types the app lacks into tasks", () => {
    const draft: IssueDraft = { title: "Logo", description: "", type: "art", priority: "low", status: { name: "Code review", category: "doing" }, sprint: { name: "sprint 9", state: "planned" }, labels: [] };
    const merged = mergeIntoBoard(board, [], [draft], ["feature", "bug", "task"]);
    expect(merged.issues[0]).toMatchObject({ status: "in-progress", type: "task", sprintId: "now", key: "PIP-8" });
    expect(merged.board.columns).toHaveLength(3);
    expect(merged.warnings).toEqual(["1 issue has a type this board doesn't offer, so it became a task"]);
  });

  it("rejects JSON that isn't a board export", async () => {
    expect(await runImporter(boardJsonImporter, textFile("[]"))).toEqual({ ok: false, message: expect.stringContaining("isn't a board file") });
  });
});
