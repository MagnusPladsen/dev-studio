import { v4 as uuid } from "uuid";
import type { Board, BoardColumn, Issue, IssueType, Sprint } from "@/types";
import { issueNumber } from "@/lib/board";
import type { IssueDraft, SprintDraft } from "./types";

/** Same palette as the board's own new columns. */
const COLUMN_COLORS = ["#94a3b8", "#60a5fa", "#fbbf24", "#a78bfa", "#f472b6", "#fb923c", "#34d399", "#2dd4bf"];

export interface BoardMerge {
  board: Board;
  /** The new issues, in file order. */
  issues: Issue[];
  warnings: string[];
}

const nameKey = (name: string) => name.trim().toLowerCase();

function slug(name: string, taken: Set<string>): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "column";
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  taken.add(id);
  return id;
}

/** Finds each draft's column by name; board exports add the missing ones, CSV rows go to a column of their kind. */
function columnResolver(board: Board, added: BoardColumn[]) {
  const columns = [...board.columns];
  const ids = new Set(columns.map((column) => column.id));
  return (status: IssueDraft["status"]): BoardColumn => {
    const named = columns.find((column) => nameKey(column.name) === nameKey(status.name));
    if (named) return named;
    if (status.addIfMissing || columns.length === 0) {
      const column = { id: slug(status.name, ids), name: status.name.trim(), color: status.color ?? COLUMN_COLORS[columns.length % COLUMN_COLORS.length], category: status.category };
      columns.push(column);
      added.push(column);
      return column;
    }
    return columns.find((column) => column.category === status.category) ?? columns[0];
  };
}

/** Finds each draft's sprint by name and adds the missing ones; a board only ever has one active sprint. */
function sprintResolver(board: Board, added: Sprint[]) {
  const sprints = [...board.sprints];
  return (draft: SprintDraft): Sprint => {
    const named = sprints.find((sprint) => nameKey(sprint.name) === nameKey(draft.name));
    if (named) return named;
    const hasActive = sprints.some((sprint) => sprint.state === "active");
    const sprint: Sprint = { ...draft, id: uuid(), name: draft.name.trim(), state: draft.state === "active" && hasActive ? "planned" : draft.state };
    sprints.push(sprint);
    added.push(sprint);
    return sprint;
  };
}

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * Adds imported issues to the project's one board. Statuses and sprints are matched by name (missing sprints, and
 * missing columns from board exports, are added), and the issues get keys after the highest one on the board.
 */
export function mergeIntoBoard(board: Board, existing: Issue[], drafts: IssueDraft[], types: IssueType[], now = new Date().toISOString()): BoardMerge {
  const addedColumns: BoardColumn[] = [];
  const addedSprints: Sprint[] = [];
  const columnFor = columnResolver(board, addedColumns);
  const sprintFor = sprintResolver(board, addedSprints);
  const highest = existing.filter((issue) => issue.key.startsWith(board.keyPrefix + "-")).reduce((max, issue) => Math.max(max, issueNumber(issue.key)), 0);
  let next = Math.max(board.nextNumber, highest + 1);
  const lastOrder = new Map<string, number>();
  for (const issue of existing) lastOrder.set(issue.status, Math.max(lastOrder.get(issue.status) ?? 0, issue.order));
  let retyped = 0;

  const issues = drafts.map((draft): Issue => {
    const column = columnFor(draft.status);
    const order = (lastOrder.get(column.id) ?? 0) + 1000;
    lastOrder.set(column.id, order);
    const type = draft.type && types.includes(draft.type) ? draft.type : "task";
    if (draft.type && type !== draft.type) retyped++;
    const issue: Issue = {
      id: uuid(),
      projectId: board.projectId,
      key: `${board.keyPrefix}-${next++}`,
      title: draft.title,
      description: draft.description,
      type,
      priority: draft.priority,
      status: column.id,
      sprintId: draft.sprint ? sprintFor(draft.sprint).id : null,
      labels: draft.labels,
      order,
      tags: [],
      createdAt: now,
      updatedAt: now,
    };
    if (draft.points !== undefined) issue.points = draft.points;
    if (draft.dueDate) issue.dueDate = draft.dueDate;
    if (column.category === "done") issue.resolvedAt = now;
    if (draft.archived) issue.archived = true;
    return issue;
  });

  const warnings = [];
  if (addedColumns.length) warnings.push(`Added ${plural(addedColumns.length, "column", "columns")}: ${addedColumns.map((column) => column.name).join(", ")}`);
  if (addedSprints.length) warnings.push(`Added ${plural(addedSprints.length, "sprint", "sprints")}: ${addedSprints.map((sprint) => sprint.name).join(", ")}`);
  if (retyped) warnings.push(`${plural(retyped, "issue has a type", "issues have types")} this board doesn't offer, so ${retyped === 1 ? "it became a task" : "they became tasks"}`);
  return {
    board: { ...board, columns: [...board.columns, ...addedColumns], sprints: [...board.sprints, ...addedSprints], nextNumber: next, updatedAt: now },
    issues,
    warnings,
  };
}
