import { v4 as uuid } from "uuid";
import type { Board, BoardColumn, ColumnCategory, Issue, IssuePriority, IssueType, Sprint } from "@/types";
import type { AppId } from "./app-config";
import { copyFor } from "@/copy";
import { storage } from "./storage";
import { normalizeTag } from "./tags";

/**
 * Task Board logic without React or the DOM: keys, moves, columns, sprints, archive, labels and points.
 * The board page and the MCP server both call these, so they write the same rows.
 */

export const DAY = 86_400_000;
const ORDER_STEP = 1000;
const SPRINT_LENGTH_DAYS = 14;

export const DEFAULT_COLUMNS: BoardColumn[] = [
  { id: "todo", name: "To Do", color: "#94a3b8", category: "todo" },
  { id: "in-progress", name: "In Progress", color: "#60a5fa", category: "doing" },
  { id: "testing", name: "Testing", color: "#fbbf24", category: "doing" },
  { id: "done", name: "Done", color: "#34d399", category: "done" },
];

export const COLUMN_COLORS = ["#94a3b8", "#60a5fa", "#fbbf24", "#a78bfa", "#f472b6", "#fb923c", "#34d399", "#2dd4bf"];

/** Highest first, as the pickers list them. */
export const PRIORITIES: IssuePriority[] = ["highest", "high", "medium", "low", "lowest"];

const GAME_TYPES: IssueType[] = ["feature", "bug", "task", "art", "audio", "design", "writing"];
const DEV_TYPES: IssueType[] = ["feature", "bug", "task", "design", "chore", "docs"];

/** The types an app offers when creating or filtering issues. Saved issues keep whatever type they have. */
export function issueTypesFor(app: AppId): IssueType[] {
  return app === "dev-studio" ? DEV_TYPES : GAME_TYPES;
}

/** A type's label in an app, or the raw value for a type this version doesn't know. */
export function issueTypeLabel(type: string, app: AppId): string {
  const labels = copyFor(app).board.issueTypes;
  return Object.hasOwn(labels, type) ? labels[type as IssueType] : type;
}

// ─── dates ───────────────────────────────────────────────────────────────────

/** The local calendar date as YYYY-MM-DD (not UTC, so it matches the user's own day). */
export function today(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function isOverdue(issue: Pick<Issue, "dueDate" | "resolvedAt">): boolean {
  return !!issue.dueDate && !issue.resolvedAt && issue.dueDate < today();
}

export function daysLeft(end?: string): number | null {
  if (!end) return null;
  return Math.ceil((Date.parse(end + "T23:59:59") - Date.now()) / DAY);
}

// ─── keys ────────────────────────────────────────────────────────────────────

/** "Pip's Quest" → "PIP". */
export function issueKeyPrefix(projectName: string | undefined): string {
  const letters = (projectName ?? "").replace(/[^a-z]/gi, "").toUpperCase();
  return letters.slice(0, 3) || "ISS";
}

export function issueNumber(key: string): number {
  const n = parseInt(key.split("-").pop() ?? "", 10);
  return Number.isFinite(n) ? n : 0;
}

// ─── board ───────────────────────────────────────────────────────────────────

export function createDefaultBoard(projectId: string): Board {
  const now = new Date().toISOString();
  const prefix = issueKeyPrefix(storage.getById("projects", projectId)?.name);
  const board: Board = {
    id: uuid(),
    projectId,
    name: "Task Board",
    keyPrefix: prefix,
    nextNumber: 1,
    columns: DEFAULT_COLUMNS.map((c) => ({ ...c })),
    sprints: [],
    createdAt: now,
    updatedAt: now,
  };
  storage.save("boards", board, projectId);
  return board;
}

/** The project's one board, made on first use. */
export function getOrCreateBoard(projectId: string): Board {
  return storage.getAll("boards", projectId)[0] ?? createDefaultBoard(projectId);
}

export function saveBoard(projectId: string, board: Board, patch: Partial<Board>): Board {
  const next = { ...board, ...patch, updatedAt: new Date().toISOString() };
  storage.save("boards", next, projectId);
  return next;
}

export function columnOf(board: Board, id: string): BoardColumn | undefined {
  return board.columns.find((c) => c.id === id);
}

export function doneColumnIds(board: Board): Set<string> {
  return new Set(board.columns.filter((c) => c.category === "done").map((c) => c.id));
}

export function activeSprintOf(board: Board): Sprint | undefined {
  return board.sprints.find((s) => s.state === "active");
}

// ─── issues ──────────────────────────────────────────────────────────────────

export const byOrder = (a: Issue, b: Issue) => a.order - b.order || a.createdAt.localeCompare(b.createdAt);

/** Saves an issue; keeps `resolvedAt` in step with whether its column counts as done. */
export function saveIssue(projectId: string, board: Board | undefined, issue: Issue, patch: Partial<Issue>): Issue {
  const next: Issue = { ...issue, ...patch, updatedAt: new Date().toISOString() };
  if (board && patch.status !== undefined && patch.status !== issue.status) {
    const done = columnOf(board, next.status)?.category === "done";
    next.resolvedAt = done ? issue.resolvedAt ?? new Date().toISOString() : undefined;
  }
  storage.save("issues", next, projectId);
  return next;
}

/** Next free key number, never reusing a number already taken by an issue. */
export function takeIssueKey(projectId: string, board: Board): { key: string; board: Board } {
  const max = storage
    .getAll("issues", projectId)
    .filter((i) => i.key.startsWith(board.keyPrefix + "-"))
    .reduce((m, i) => Math.max(m, issueNumber(i.key)), 0);
  const n = Math.max(board.nextNumber, max + 1);
  const updated = saveBoard(projectId, board, { nextNumber: n + 1 });
  return { key: `${board.keyPrefix}-${n}`, board: updated };
}

export function createIssue(
  projectId: string,
  board: Board,
  fields: Partial<Issue> & Pick<Issue, "title">
): { issue: Issue; board: Board } {
  const { key, board: b } = takeIssueKey(projectId, board);
  const status = fields.status ?? b.columns[0]?.id ?? "todo";
  const siblings = storage.getAll("issues", projectId).filter((i) => i.status === status);
  const now = new Date().toISOString();
  const issue: Issue = {
    id: uuid(),
    projectId,
    key,
    description: "",
    type: "task",
    priority: "medium",
    sprintId: null,
    labels: [],
    tags: [],
    order: siblings.reduce((m, i) => Math.max(m, i.order), 0) + ORDER_STEP,
    createdAt: now,
    updatedAt: now,
    ...fields,
    status,
    resolvedAt: columnOf(b, status)?.category === "done" ? now : undefined,
  };
  storage.save("issues", issue, projectId);
  return { issue, board: b };
}

/**
 * Puts an issue into a lane (`siblings`, the other issues already there) before `beforeId`, or last,
 * then renumbers the lane 1000, 2000, … The moved issue also gets `patch` (its new column or sprint).
 */
function placeInLane(projectId: string, board: Board, issueId: string, siblings: Issue[], beforeId: string | null, patch: Partial<Issue>): void {
  const moving = storage.getById("issues", issueId, projectId);
  if (!moving) return;
  const lane = siblings.filter((i) => i.id !== issueId).sort(byOrder);
  let at = beforeId ? lane.findIndex((i) => i.id === beforeId) : lane.length;
  if (at < 0) at = lane.length;
  lane.splice(at, 0, moving);
  lane.forEach((issue, index) => {
    const order = (index + 1) * ORDER_STEP;
    if (issue.id === issueId) saveIssue(projectId, board, issue, { ...patch, order });
    else if (issue.order !== order) storage.save("issues", { ...issue, order }, projectId);
  });
}

/** The open issues the board view shows: the active sprint's, or every open one when no sprint runs. */
export function issuesOnBoard(board: Board, issues: Issue[]): Issue[] {
  const active = activeSprintOf(board);
  return issues.filter((i) => !i.archived && (active ? i.sprintId === active.id : true));
}

/** Moves an issue to a column, before `beforeId` or at the bottom, like drag and drop on the board. */
export function moveIssueToColumn(projectId: string, board: Board, issueId: string, status: string, beforeId: string | null = null): void {
  const lane = issuesOnBoard(board, storage.getAll("issues", projectId)).filter((i) => i.status === status);
  placeInLane(projectId, board, issueId, lane, beforeId, { status });
}

/** Moves an issue to a sprint (null = backlog), before `beforeId` or at the bottom, like drag and drop in Backlog. */
export function moveIssueToSprint(projectId: string, board: Board, issueId: string, sprintId: string | null, beforeId: string | null = null): void {
  const lane = storage.getAll("issues", projectId).filter((i) => !i.archived && i.sprintId === sprintId);
  placeInLane(projectId, board, issueId, lane, beforeId, { sprintId });
}

export function archiveIssue(projectId: string, board: Board, issue: Issue): Issue {
  return saveIssue(projectId, board, issue, { archived: true });
}

export function restoreIssue(projectId: string, board: Board, issue: Issue): Issue {
  return saveIssue(projectId, board, issue, { archived: false });
}

/** Takes finished issues off the board (no sprint running). They stay in All issues. */
export function archiveDoneIssues(projectId: string, board: Board): Issue[] {
  const done = doneColumnIds(board);
  return issuesOnBoard(board, storage.getAll("issues", projectId))
    .filter((i) => done.has(i.status))
    .map((i) => archiveIssue(projectId, board, i));
}

/** `labels` plus one typed label, normalised; the same list when it's empty or already there. */
export function withLabel(labels: string[], typed: string): string[] {
  const label = normalizeTag("label", typed);
  return label && !labels.includes(label) ? [...labels, label] : labels;
}

export function withoutLabel(labels: string[], label: string): string[] {
  return labels.filter((l) => l !== label);
}

/** Story points are never negative. */
export function clampPoints(points: number): number {
  return Math.max(0, points);
}

// ─── columns ─────────────────────────────────────────────────────────────────

export type BoardChange = { ok: true; board: Board } | { ok: false; error: string };

/** Adds a column in the first unused colour, just before the first Done column. */
export function addColumn(projectId: string, board: Board): Board {
  const used = new Set(board.columns.map((c) => c.color));
  const column: BoardColumn = {
    id: uuid(),
    name: "New column",
    color: COLUMN_COLORS.find((c) => !used.has(c)) ?? COLUMN_COLORS[0],
    category: "doing",
  };
  const doneAt = board.columns.findIndex((c) => c.category === "done");
  const columns = [...board.columns];
  columns.splice(doneAt === -1 ? columns.length : doneAt, 0, column);
  return saveBoard(projectId, board, { columns });
}

export function patchColumn(projectId: string, board: Board, columnId: string, patch: Partial<BoardColumn>): Board {
  return saveBoard(projectId, board, { columns: board.columns.map((c) => (c.id === columnId ? { ...c, ...patch } : c)) });
}

function isLastDoneColumn(board: Board, column: BoardColumn): boolean {
  return column.category === "done" && board.columns.filter((c) => c.category === "done").length === 1;
}

/** Changes what a column counts as; its issues gain or lose `resolvedAt` to match. A board keeps one Done column. */
export function setColumnCategory(projectId: string, board: Board, columnId: string, category: ColumnCategory): BoardChange {
  const column = columnOf(board, columnId);
  if (!column) return { ok: false, error: "That column is gone." };
  if (category !== "done" && isLastDoneColumn(board, column)) {
    return { ok: false, error: "Keep at least one Done column, so finished work can be counted." };
  }
  const next = patchColumn(projectId, board, columnId, { category });
  const done = category === "done";
  for (const i of storage.getAll("issues", projectId).filter((x) => x.status === columnId)) {
    if (done && !i.resolvedAt) storage.save("issues", { ...i, resolvedAt: new Date().toISOString() }, projectId);
    if (!done && i.resolvedAt) storage.save("issues", { ...i, resolvedAt: undefined }, projectId);
  }
  return { ok: true, board: next };
}

/** Swaps a column with its neighbour (`-1` left, `1` right); nothing happens at either end. */
export function shiftColumn(projectId: string, board: Board, columnId: string, direction: -1 | 1): Board {
  const index = board.columns.findIndex((c) => c.id === columnId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= board.columns.length) return board;
  const columns = [...board.columns];
  [columns[index], columns[target]] = [columns[target], columns[index]];
  return saveBoard(projectId, board, { columns });
}

/** Removes a column, first moving its issues to `moveIssuesTo`. A board keeps one column and one Done column. */
export function removeColumn(projectId: string, board: Board, columnId: string, moveIssuesTo?: string): BoardChange {
  const column = columnOf(board, columnId);
  if (!column) return { ok: false, error: "That column is gone." };
  if (board.columns.length === 1) return { ok: false, error: "A board needs at least one column." };
  if (isLastDoneColumn(board, column)) return { ok: false, error: "Keep at least one Done column." };
  const inColumn = storage.getAll("issues", projectId).filter((i) => i.status === columnId);
  if (inColumn.length) {
    const target = board.columns.find((c) => c.id === moveIssuesTo);
    if (!target) return { ok: false, error: "Choose where its issues should go." };
    for (const i of inColumn) saveIssue(projectId, board, i, { status: target.id });
  }
  return { ok: true, board: saveBoard(projectId, board, { columns: board.columns.filter((c) => c.id !== columnId) }) };
}

// ─── sprints ─────────────────────────────────────────────────────────────────

/** Adds a planned sprint, named "Sprint n" unless `fields` say otherwise. */
export function createSprint(projectId: string, board: Board, fields: Partial<Omit<Sprint, "id" | "state">> = {}): { sprint: Sprint; board: Board } {
  const sprint: Sprint = { id: uuid(), name: `Sprint ${board.sprints.length + 1}`, ...fields, state: "planned" };
  return { sprint, board: saveBoard(projectId, board, { sprints: [...board.sprints, sprint] }) };
}

export function patchSprint(projectId: string, board: Board, sprintId: string, patch: Partial<Sprint>): Board {
  return saveBoard(projectId, board, { sprints: board.sprints.map((s) => (s.id === sprintId ? { ...s, ...patch } : s)) });
}

/** Starts a sprint today (or on its start date) for two weeks unless it has an end date. One sprint runs at a time. */
export function startSprint(projectId: string, board: Board, sprintId: string): BoardChange {
  const sprint = board.sprints.find((s) => s.id === sprintId);
  if (!sprint) return { ok: false, error: "That sprint is gone." };
  const active = activeSprintOf(board);
  if (active && active.id !== sprintId) return { ok: false, error: `Complete "${active.name}" first: one sprint runs at a time.` };
  const start = sprint.startDate || today();
  const end = sprint.endDate || new Date(Date.parse(start) + (SPRINT_LENGTH_DAYS - 1) * DAY).toISOString().slice(0, 10);
  return { ok: true, board: patchSprint(projectId, board, sprintId, { state: "active", startDate: start, endDate: end }) };
}

/** Deletes a sprint; its issues go back to the backlog. */
export function deleteSprint(projectId: string, board: Board, sprintId: string): Board {
  for (const i of storage.getAll("issues", projectId).filter((x) => x.sprintId === sprintId)) saveIssue(projectId, board, i, { sprintId: null });
  return saveBoard(projectId, board, { sprints: board.sprints.filter((s) => s.id !== sprintId) });
}

/** Closes a sprint: done issues are archived, open ones move to `targetSprintId` (null = backlog). */
export function completeSprint(projectId: string, board: Board, sprintId: string, targetSprintId: string | null): Board {
  const doneIds = doneColumnIds(board);
  for (const issue of storage.getAll("issues", projectId)) {
    if (issue.sprintId !== sprintId || issue.archived) continue;
    if (doneIds.has(issue.status)) saveIssue(projectId, board, issue, { archived: true });
    else saveIssue(projectId, board, issue, { sprintId: targetSprintId });
  }
  const closedAt = new Date().toISOString();
  return saveBoard(projectId, board, { sprints: board.sprints.map((s) => (s.id === sprintId ? { ...s, state: "closed", closedAt } : s)) });
}

/** Brings a closed sprint back as a planned one, ready to start again. */
export function reopenSprint(projectId: string, board: Board, sprintId: string): Board {
  return saveBoard(projectId, board, {
    sprints: board.sprints.map((s) => (s.id === sprintId ? { ...s, state: "planned", closedAt: undefined } : s)),
  });
}
