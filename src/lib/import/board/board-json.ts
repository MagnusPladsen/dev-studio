import type { Board, BoardColumn, ColumnCategory, Issue, IssuePriority } from "@/types";
import { ImportError, type Importer } from "@/lib/import";
import { issueNumber } from "@/lib/board";
import { categoryFrom, priorityFrom } from "./fields";
import type { IssueDraft, SprintDraft } from "./types";

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown) => (typeof value === "string" ? value : "");
const CATEGORIES: ColumnCategory[] = ["todo", "doing", "done"];
const PRIORITIES: IssuePriority[] = ["lowest", "low", "medium", "high", "highest"];

const NOT_A_BOARD = "This isn't a board file. Export one from the Task Board with Export → JSON.";

function readColumns(board: Record<string, unknown>): Map<string, BoardColumn> {
  const columns = Array.isArray(board.columns) ? board.columns.filter(isRecord) : [];
  return new Map(
    columns.map((column) => {
      const name = text(column.name) || text(column.id);
      const category = CATEGORIES.includes(column.category as ColumnCategory) ? (column.category as ColumnCategory) : categoryFrom(name);
      return [text(column.id), { id: text(column.id), name, color: text(column.color), category }];
    })
  );
}

function readSprints(board: Record<string, unknown>): Map<string, SprintDraft> {
  const sprints = Array.isArray(board.sprints) ? board.sprints.filter(isRecord) : [];
  return new Map(
    sprints.map((sprint) => {
      const state = sprint.state === "active" || sprint.state === "closed" ? sprint.state : "planned";
      const draft: SprintDraft = { name: text(sprint.name) || "Sprint", state };
      if (text(sprint.goal)) draft.goal = text(sprint.goal);
      if (text(sprint.startDate)) draft.startDate = text(sprint.startDate);
      if (text(sprint.endDate)) draft.endDate = text(sprint.endDate);
      return [text(sprint.id), draft];
    })
  );
}

function readIssue(issue: Record<string, unknown>, columns: Map<string, BoardColumn>, sprints: Map<string, SprintDraft>): IssueDraft {
  const statusId = text(issue.status);
  const column = columns.get(statusId);
  const draft: IssueDraft = {
    title: text(issue.title) || "Untitled issue",
    description: text(issue.description),
    type: text(issue.type) ? (issue.type as Issue["type"]) : null,
    priority: PRIORITIES.includes(issue.priority as IssuePriority) ? (issue.priority as IssuePriority) : priorityFrom(text(issue.priority)),
    status: column ? { name: column.name, category: column.category, color: column.color || undefined, addIfMissing: true } : { name: statusId || "To Do", category: categoryFrom(statusId) },
    sprint: typeof issue.sprintId === "string" ? sprints.get(issue.sprintId) ?? null : null,
    labels: Array.isArray(issue.labels) ? issue.labels.filter((label): label is string => typeof label === "string") : [],
  };
  if (typeof issue.points === "number") draft.points = issue.points;
  if (text(issue.dueDate)) draft.dueDate = text(issue.dueDate);
  if (issue.archived === true) draft.archived = true;
  return draft;
}

/**
 * Re-imports the Task Board's JSON export (`{ board, issues }`). A project has one board, so the issues are added to
 * it: its columns, sprints and labels are matched by name and added when missing, and the issues get new keys.
 */
export const boardJsonImporter: Importer<IssueDraft> = {
  id: "board-json",
  label: "Board JSON (.json)",
  description: "Issues exported from a Task Board, added to this one",
  accept: [".json", "application/json"],
  async parse(file) {
    const data: unknown = JSON.parse(await file.text());
    if (!isRecord(data) || !isRecord(data.board) || !Array.isArray(data.issues)) throw new ImportError(NOT_A_BOARD);
    const board = data.board as Partial<Board> & Record<string, unknown>;
    const columns = readColumns(board);
    const sprints = readSprints(board);
    const issues = data.issues.filter((issue): issue is Record<string, unknown> => isRecord(issue) && typeof issue.title === "string");
    const items = [...issues].sort((a, b) => issueNumber(text(a.key)) - issueNumber(text(b.key))).map((issue) => readIssue(issue, columns, sprints));
    const skipped = data.issues.length - issues.length;
    return { items, warnings: skipped ? [`Left out ${skipped} ${skipped === 1 ? "issue" : "issues"} without a title`] : [] };
  },
};
