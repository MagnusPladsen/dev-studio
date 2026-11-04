import * as z from "zod";
import { v4 as uuid } from "uuid";
import type { Board, Issue, IssueType, Project, Sprint } from "@/types";
import { appConfigFor, type AppId } from "@/lib/app-config";
import {
  activeSprintOf,
  archiveIssue,
  byOrder,
  clampPoints,
  columnOf,
  completeSprint,
  createIssue,
  createSprint,
  doneColumnIds,
  getOrCreateBoard,
  issuesOnBoard,
  issueTypeLabel,
  issueTypesFor,
  moveIssueToColumn,
  moveIssueToSprint,
  restoreIssue,
  saveIssue,
  startSprint,
  withLabel,
  withoutLabel,
} from "@/lib/board";
import { addLink } from "@/lib/links";
import { ISSUE_PRIORITIES, ISSUE_TYPES } from "@/lib/schema/board";
import { storage, type ProjectCollection } from "@/lib/storage";
import { normalizeTag } from "@/lib/tags";
import { taskProgress } from "@/lib/task-list";
import { assetRefSchema, assetUrl, projectApp, projectIdSchema, requireProject, requireRef } from "../refs";
import { readAsset } from "./assets";
import { guarded, READ_ONLY, result, WRITES, type ToolContext } from "./context";
import { registerCheckTaskTool } from "./tasks";

const MAX_ROWS = 100;
const DEFAULT_LIST_LIMIT = 50;
const BOARD_SCOPE: ProjectCollection[] = ["boards", "issues"];

const issueIdSchema = z.string().trim().min(1).max(100).describe('Issue key like "TIDE-12", or the issue id.');
const sprintSchema = z.string().trim().min(1).max(200).describe('"active", "backlog", or a sprint id or name.');
const columnSchema = z.string().trim().min(1).max(200).describe("Column id or name, like In Progress.");
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Dates look like 2026-11-30.");
const labelsSchema = z.array(z.string().trim().min(1).max(60)).max(50);
const typeSchema = z.enum(ISSUE_TYPES);
const prioritySchema = z.enum(ISSUE_PRIORITIES);

// ─── lookups on the loaded board ─────────────────────────────────────────────

function requireBoard(projectId: string): Board {
  const board = storage.getAll("boards", projectId)[0];
  if (!board) throw new Error("This project has no Task Board yet. create_issues makes one.");
  return board;
}

function findIssue(projectId: string, keyOrId: string): Issue {
  const wanted = keyOrId.toLowerCase();
  const issue = storage.getAll("issues", projectId).find((i) => i.id === keyOrId || i.key.toLowerCase() === wanted);
  if (!issue) throw new Error(`No issue ${keyOrId} in this project. list_issues shows the keys.`);
  return issue;
}

function findColumn(board: Board, idOrName: string): string {
  const wanted = idOrName.toLowerCase();
  const column = board.columns.find((c) => c.id === idOrName || c.name.toLowerCase() === wanted);
  if (!column) throw new Error(`No column "${idOrName}". Columns: ${board.columns.map((c) => c.name).join(", ")}.`);
  return column.id;
}

function findSprint(board: Board, idOrName: string): Sprint {
  const wanted = idOrName.toLowerCase();
  const sprint = board.sprints.find((s) => s.id === idOrName || s.name.toLowerCase() === wanted);
  if (!sprint) throw new Error(`No sprint "${idOrName}". Sprints: ${board.sprints.map((s) => s.name).join(", ") || "none yet"}.`);
  return sprint;
}

/** "active" / "backlog" / a sprint id or name → the sprint id to file an issue under (null = backlog). */
function sprintIdFor(board: Board, input: string): string | null {
  if (input.toLowerCase() === "backlog") return null;
  if (input.toLowerCase() === "active") {
    const active = activeSprintOf(board);
    if (!active) throw new Error("No sprint is running. Use create_sprint with start: true, or pass a sprint name.");
    return active.id;
  }
  const sprint = findSprint(board, input);
  if (sprint.state === "closed") throw new Error(`"${sprint.name}" is completed. Pick a planned or active sprint.`);
  return sprint.id;
}

function checkType(type: IssueType, app: AppId): IssueType {
  const offered = issueTypesFor(app);
  if (!offered.includes(type)) throw new Error(`${appConfigFor(app).name} issue types are: ${offered.join(", ")}.`);
  return type;
}

function addLabels(labels: string[], typed: string[]): string[] {
  return typed.reduce(withLabel, labels);
}

// ─── how issues and the board read back ──────────────────────────────────────

function issueRow(project: Project, board: Board, issue: Issue) {
  return {
    key: issue.key,
    id: issue.id,
    title: issue.title,
    column: columnOf(board, issue.status)?.name ?? issue.status,
    priority: issue.priority,
    type: issueTypeLabel(issue.type, projectApp(project)),
    points: issue.points,
    sprint: issue.sprintId ? (board.sprints.find((s) => s.id === issue.sprintId)?.name ?? issue.sprintId) : "Backlog",
    labels: issue.labels,
    ...(issue.dueDate ? { dueDate: issue.dueDate } : {}),
    ...(issue.archived ? { archived: true } : {}),
    url: assetUrl(project, { type: "issue", id: issue.id }),
  };
}

type IssueRow = ReturnType<typeof issueRow>;

function rowLine(row: IssueRow): string {
  const parts = [row.key, row.title, row.column, row.priority, row.type, row.points !== undefined ? `${row.points} pts` : "", row.sprint];
  if (row.labels.length) parts.push(`#${row.labels.join(" #")}`);
  if (row.archived) parts.push("archived");
  return `- ${parts.filter(Boolean).join(" · ")}`;
}

function sprintSummary(board: Board, sprint: Sprint, issues: Issue[]) {
  const done = doneColumnIds(board);
  const inSprint = issues.filter((i) => i.sprintId === sprint.id && !i.archived);
  const archived = issues.filter((i) => i.sprintId === sprint.id && i.archived).length;
  return {
    id: sprint.id,
    name: sprint.name,
    state: sprint.state,
    goal: sprint.goal,
    startDate: sprint.startDate,
    endDate: sprint.endDate,
    issues: { open: inSprint.filter((i) => !done.has(i.status)).length, done: inSprint.filter((i) => done.has(i.status)).length, archived },
  };
}

function boardOverview(projectId: string) {
  const project = requireProject(projectId);
  const app = projectApp(project);
  const board = storage.getAll("boards", projectId)[0];
  const issueTypes = issueTypesFor(app).map((type) => ({ type, label: issueTypeLabel(type, app) }));
  if (!board) return { project: project.name, board: null, issueTypes };
  const issues = storage.getAll("issues", projectId);
  const live = issues.filter((i) => !i.archived);
  return {
    project: project.name,
    board: {
      keyPrefix: board.keyPrefix,
      columns: board.columns.map((c) => ({ id: c.id, name: c.name, category: c.category, issues: issuesOnBoard(board, issues).filter((i) => i.status === c.id).length })),
      sprints: board.sprints.map((s) => sprintSummary(board, s, issues)),
      backlog: live.filter((i) => i.sprintId === null).length,
      labels: [...new Set(live.flatMap((i) => i.labels))].sort(),
    },
    issueTypes,
    url: `${appConfigFor(app).url}/project/${projectId}/board`,
  };
}

function boardMarkdown(overview: ReturnType<typeof boardOverview>): string {
  const types = `Issue types: ${overview.issueTypes.map((t) => `${t.type} (${t.label})`).join(", ")}`;
  const { board } = overview;
  if (!board) return `${overview.project} has no Task Board yet; create_issues makes one.\n${types}`;
  const sprint = (s: (typeof board.sprints)[number]) =>
    `- ${s.name} [${s.state}]${s.startDate ? ` ${s.startDate}–${s.endDate ?? "?"}` : ""}: ${s.issues.open} open, ${s.issues.done} done, ${s.issues.archived} archived (id ${s.id})${s.goal ? `\n  goal: ${s.goal}` : ""}`;
  return [
    `# ${overview.project} board (keys ${board.keyPrefix}-n)`,
    `Columns (the board shows ${board.sprints.some((s) => s.state === "active") ? "the active sprint" : "every open issue"}): ${board.columns.map((c) => `${c.name} [${c.category}] ${c.issues}`).join(", ")}`,
    "Sprints:",
    ...(board.sprints.length ? board.sprints.map(sprint) : ["- none yet"]),
    `Backlog: ${board.backlog} issues`,
    `Labels in use: ${board.labels.join(", ") || "none"}`,
    types,
    `Open: ${overview.url}`,
  ].join("\n");
}

// ─── list ────────────────────────────────────────────────────────────────────

const listFilters = z.object({
  projectId: projectIdSchema,
  sprint: sprintSchema.optional(),
  column: columnSchema.optional(),
  category: z.enum(["todo", "doing", "done"]).optional(),
  type: typeSchema.optional(),
  priority: prioritySchema.optional(),
  label: z.string().trim().min(1).max(60).optional(),
  text: z.string().trim().min(1).max(200).optional().describe("Words in the key, title or description."),
  includeArchived: z.boolean().optional(),
  limit: z.number().int().min(1).max(200).optional().describe(`Default ${DEFAULT_LIST_LIMIT}.`),
});

function sprintFilter(board: Board, input: string): (issue: Issue) => boolean {
  const lower = input.toLowerCase();
  if (lower === "backlog") return (i) => i.sprintId === null;
  if (lower === "active") {
    const active = activeSprintOf(board);
    return (i) => !!active && i.sprintId === active.id;
  }
  const sprint = findSprint(board, input);
  return (i) => i.sprintId === sprint.id;
}

function listIssues(filters: z.infer<typeof listFilters>): { total: number; rows: IssueRow[] } {
  const project = requireProject(filters.projectId);
  const board = storage.getAll("boards", filters.projectId)[0];
  if (!board) return { total: 0, rows: [] };
  const checks: ((issue: Issue) => boolean)[] = [];
  if (!filters.includeArchived) checks.push((i) => !i.archived);
  if (filters.sprint) checks.push(sprintFilter(board, filters.sprint));
  if (filters.column) {
    const column = findColumn(board, filters.column);
    checks.push((i) => i.status === column);
  }
  if (filters.category) checks.push((i) => columnOf(board, i.status)?.category === filters.category);
  if (filters.type) checks.push((i) => i.type === filters.type);
  if (filters.priority) checks.push((i) => i.priority === filters.priority);
  if (filters.label) {
    const label = normalizeTag("label", filters.label);
    checks.push((i) => i.labels.includes(label));
  }
  if (filters.text) {
    const words = filters.text.toLowerCase();
    checks.push((i) => `${i.key} ${i.title} ${i.description}`.toLowerCase().includes(words));
  }
  const columnIndex = new Map(board.columns.map((c, index) => [c.id, index]));
  const matches = storage
    .getAll("issues", filters.projectId)
    .filter((i) => checks.every((check) => check(i)))
    .sort((a, b) => (columnIndex.get(a.status) ?? 99) - (columnIndex.get(b.status) ?? 99) || byOrder(a, b));
  return { total: matches.length, rows: matches.slice(0, filters.limit ?? DEFAULT_LIST_LIMIT).map((i) => issueRow(project, board, i)) };
}

// ─── create ──────────────────────────────────────────────────────────────────

const newIssueSchema = z.object({
  title: z.string().trim().min(1).max(500),
  description: z.string().max(100_000).optional().describe("Markdown. - [ ] lines become a checklist."),
  type: typeSchema.optional().describe("Default task."),
  priority: prioritySchema.optional().describe("Default medium."),
  column: columnSchema.optional().describe("Default the first column (To Do)."),
  sprint: sprintSchema.optional().describe('Default "backlog".'),
  points: z.number().min(0).max(1000).optional(),
  dueDate: dateSchema.optional(),
  labels: labelsSchema.optional(),
  linkTo: z.array(assetRefSchema).max(20).optional().describe("Assets to link the new issue to."),
});

/**
 * `ids` are picked once per call. `save_assets` writes row by row, so when a retry follows a
 * conflict, issues that already landed are found by id and kept instead of being created twice.
 */
function createIssues(projectId: string, specs: z.infer<typeof newIssueSchema>[], ids: string[]): IssueRow[] {
  const project = requireProject(projectId);
  const app = projectApp(project);
  let board = getOrCreateBoard(projectId);
  const created: Issue[] = [];
  for (const [index, spec] of specs.entries()) {
    for (const ref of spec.linkTo ?? []) requireRef(projectId, ref);
    const landed = storage.getById("issues", ids[index], projectId);
    if (landed) {
      for (const ref of spec.linkTo ?? []) addLink(projectId, { type: "issue", id: landed.id }, ref);
      created.push(landed);
      continue;
    }
    const fields: Partial<Issue> & Pick<Issue, "title"> = {
      id: ids[index],
      title: spec.title,
      description: spec.description ?? "",
      type: checkType(spec.type ?? "task", app),
      priority: spec.priority ?? "medium",
      sprintId: spec.sprint ? sprintIdFor(board, spec.sprint) : null,
      labels: addLabels([], spec.labels ?? []),
      ...(spec.column ? { status: findColumn(board, spec.column) } : {}),
      ...(spec.points !== undefined ? { points: clampPoints(spec.points) } : {}),
      ...(spec.dueDate ? { dueDate: spec.dueDate } : {}),
    };
    const made = createIssue(projectId, board, fields);
    board = made.board;
    for (const ref of spec.linkTo ?? []) addLink(projectId, { type: "issue", id: made.issue.id }, ref);
    created.push(made.issue);
  }
  return created.map((i) => issueRow(project, board, i));
}

// ─── update ──────────────────────────────────────────────────────────────────

const issueUpdateSchema = z.object({
  issue: issueIdSchema,
  title: z.string().trim().min(1).max(500).optional(),
  description: z.string().max(100_000).optional().describe("Replaces the description."),
  appendDescription: z.string().max(100_000).optional().describe("Added below the description as a new paragraph."),
  type: typeSchema.optional(),
  priority: prioritySchema.optional(),
  column: columnSchema.optional(),
  sprint: sprintSchema.optional(),
  points: z.number().min(0).max(1000).nullable().optional().describe("null clears it."),
  dueDate: dateSchema.nullable().optional().describe("null clears it."),
  labels: labelsSchema.optional().describe("Replaces the labels."),
  addLabels: labelsSchema.optional(),
  removeLabels: labelsSchema.optional(),
  archived: z.boolean().optional().describe("true takes a finished issue off the board; it stays searchable."),
  before: issueIdSchema.optional().describe("Place it just above this issue in its column (or sprint, when sprint is given)."),
  after: issueIdSchema.optional().describe("Place it just below this issue."),
});

type IssueUpdate = z.infer<typeof issueUpdateSchema>;

function fieldPatch(issue: Issue, update: IssueUpdate, app: AppId): Partial<Issue> {
  const patch: Partial<Issue> = {};
  if (update.title !== undefined) patch.title = update.title;
  if (update.description !== undefined) patch.description = update.description;
  if (update.appendDescription && !issue.description.endsWith(update.appendDescription)) {
    const base = patch.description ?? issue.description;
    patch.description = base.trim() ? `${base.trimEnd()}\n\n${update.appendDescription}` : update.appendDescription;
  }
  if (update.type) patch.type = checkType(update.type, app);
  if (update.priority) patch.priority = update.priority;
  if (update.points !== undefined) patch.points = update.points === null ? undefined : clampPoints(update.points);
  if (update.dueDate !== undefined) patch.dueDate = update.dueDate ?? undefined;
  if (update.labels || update.addLabels || update.removeLabels) {
    const start = update.labels ? addLabels([], update.labels) : issue.labels;
    const removed = (update.removeLabels ?? []).map((l) => normalizeTag("label", l));
    patch.labels = removed.reduce(withoutLabel, addLabels(start, update.addLabels ?? []));
  }
  return patch;
}

/** The issue id to drop the moving issue in front of, from `before` / `after` keys within `lane`. */
function beforeIdIn(projectId: string, lane: Issue[], movingId: string, update: IssueUpdate): string | null {
  if (update.before) return findIssue(projectId, update.before).id;
  if (!update.after) return null;
  const anchor = findIssue(projectId, update.after);
  const sorted = lane.filter((i) => i.id !== movingId).sort(byOrder);
  const at = sorted.findIndex((i) => i.id === anchor.id);
  if (at < 0) throw new Error(`${anchor.key} isn't in the same column or sprint, so nothing can go after it.`);
  return sorted[at + 1]?.id ?? null;
}

/** Before/after place the issue within its sprint when `sprint` is given, otherwise within its column. */
function placeIssue(projectId: string, board: Board, issueId: string, update: IssueUpdate): void {
  const hasPlace = !!(update.before || update.after);
  const all = () => storage.getAll("issues", projectId);
  const movesSprint = update.sprint !== undefined;
  if (movesSprint) {
    const sprintId = sprintIdFor(board, update.sprint!);
    const lane = all().filter((i) => !i.archived && i.sprintId === sprintId);
    moveIssueToSprint(projectId, board, issueId, sprintId, hasPlace ? beforeIdIn(projectId, lane, issueId, update) : null);
  }
  const current = storage.getById("issues", issueId, projectId)!;
  const status = update.column !== undefined ? findColumn(board, update.column) : current.status;
  const reordersColumn = hasPlace && !movesSprint;
  if (status === current.status && !reordersColumn) return;
  const lane = issuesOnBoard(board, all()).filter((i) => i.status === status);
  moveIssueToColumn(projectId, board, issueId, status, reordersColumn ? beforeIdIn(projectId, lane, issueId, update) : null);
}

function updateIssues(projectId: string, updates: IssueUpdate[]): IssueRow[] {
  const project = requireProject(projectId);
  const board = requireBoard(projectId);
  const ids = updates.map((update) => {
    if (update.before && update.after) throw new Error(`${update.issue}: pass before or after, not both.`);
    const issue = findIssue(projectId, update.issue);
    const patch = fieldPatch(issue, update, projectApp(project));
    if (Object.keys(patch).length) saveIssue(projectId, board, issue, patch);
    placeIssue(projectId, board, issue.id, update);
    if (update.archived !== undefined) {
      const latest = storage.getById("issues", issue.id, projectId)!;
      if (update.archived !== !!latest.archived) (update.archived ? archiveIssue : restoreIssue)(projectId, board, latest);
    }
    return issue.id;
  });
  return ids.map((id) => issueRow(project, board, storage.getById("issues", id, projectId)!));
}

// ─── sprints ─────────────────────────────────────────────────────────────────

const newSprintSchema = z.object({
  projectId: projectIdSchema,
  name: z.string().trim().min(1).max(200).optional().describe('Default "Sprint n".'),
  goal: z.string().trim().max(2000).optional(),
  startDate: dateSchema.optional(),
  endDate: dateSchema.optional(),
  start: z.boolean().optional().describe("Start it now (only one sprint runs at a time; two weeks unless endDate is set)."),
  issues: z.array(issueIdSchema).max(MAX_ROWS).optional().describe("Issues to move into it."),
});

/** `sprintId` is picked once per call, so a retry after a partial save finds the sprint instead of adding another. */
function addSprint(input: z.infer<typeof newSprintSchema>, sprintId: string) {
  const { projectId } = input;
  const fields = Object.fromEntries(
    Object.entries({ name: input.name, goal: input.goal, startDate: input.startDate, endDate: input.endDate }).filter(([, v]) => v)
  );
  const existing = getOrCreateBoard(projectId);
  const made = existing.sprints.some((s) => s.id === sprintId)
    ? { board: existing, sprint: existing.sprints.find((s) => s.id === sprintId)! }
    : createSprint(projectId, existing, { ...fields, id: sprintId });
  let board = made.board;
  if (input.start && made.sprint.state !== "active") {
    const started = startSprint(projectId, board, made.sprint.id);
    if (!started.ok) throw new Error(started.error);
    board = started.board;
  }
  for (const key of input.issues ?? []) moveIssueToSprint(projectId, board, findIssue(projectId, key).id, made.sprint.id);
  return sprintSummary(board, board.sprints.find((s) => s.id === made.sprint.id)!, storage.getAll("issues", projectId));
}

const completeSchema = z.object({
  projectId: projectIdSchema,
  sprint: z.string().trim().min(1).max(200).optional().describe("Sprint id or name. Default the active sprint."),
  moveOpenTo: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .optional()
    .describe('"backlog" (default), "next" (the next planned sprint, made if there is none), or a sprint id or name.'),
});

/**
 * Kept across the retries of one complete_sprint call: `save_assets` writes row by row, so a retry
 * may find the sprint already closed by this same call, or the "next" sprint already made.
 */
interface Completion {
  nextSprintId: string;
  closed?: { sprintId: string; summary: { sprint: string; archived: number; moved: number; movedTo: string } };
}

/** Where open issues go: null = backlog; "next" takes the first planned sprint, or makes one. */
function openIssueTarget(projectId: string, board: Board, closing: Sprint, input: string, nextSprintId: string): { board: Board; target: Sprint | null } {
  const lower = input.toLowerCase();
  if (lower === "backlog") return { board, target: null };
  if (lower === "next") {
    const planned = board.sprints.find((s) => s.id === nextSprintId) ?? board.sprints.find((s) => s.state === "planned" && s.id !== closing.id);
    if (planned) return { board, target: planned };
    const made = createSprint(projectId, board, { id: nextSprintId });
    return { board: made.board, target: made.sprint };
  }
  const target = findSprint(board, input);
  if (target.id === closing.id || target.state === "closed") throw new Error(`Open issues can't move to "${target.name}". Pick a planned sprint or "backlog".`);
  return { board, target };
}

function closingSprint(board: Board, input: z.infer<typeof completeSchema>, completion: Completion): Sprint {
  const retried = completion.closed && board.sprints.find((s) => s.id === completion.closed!.sprintId);
  if (retried) return retried;
  const sprint = input.sprint ? findSprint(board, input.sprint) : activeSprintOf(board);
  if (!sprint) throw new Error("No sprint is running. Pass the sprint to complete.");
  if (sprint.state === "closed") throw new Error(`"${sprint.name}" is already completed.`);
  return sprint;
}

function finishSprint(input: z.infer<typeof completeSchema>, completion: Completion) {
  const { projectId } = input;
  const board = requireBoard(projectId);
  const sprint = closingSprint(board, input, completion);
  const done = doneColumnIds(board);
  const inSprint = storage.getAll("issues", projectId).filter((i) => i.sprintId === sprint.id && !i.archived);
  const { board: withTarget, target } = openIssueTarget(projectId, board, sprint, input.moveOpenTo ?? "backlog", completion.nextSprintId);
  completeSprint(projectId, withTarget, sprint.id, target?.id ?? null);
  completion.closed ??= {
    sprintId: sprint.id,
    summary: {
      sprint: sprint.name,
      archived: inSprint.filter((i) => done.has(i.status)).length,
      moved: inSprint.filter((i) => !done.has(i.status)).length,
      movedTo: target?.name ?? "Backlog",
    },
  };
  return completion.closed.summary;
}

// ─── tools ───────────────────────────────────────────────────────────────────

function registerBoardReads(ctx: ToolContext): void {
  const { server, studio } = ctx;

  server.registerTool(
    "get_board",
    {
      title: "Get board",
      description: "A project's Task Board: columns, sprints with issue counts, key prefix, labels in use and the app's issue types.",
      inputSchema: z.object({ projectId: projectIdSchema }),
      annotations: READ_ONLY,
    },
    ({ projectId }) =>
      guarded(async () => {
        const overview = await studio.read({ projectId, collections: BOARD_SCOPE }, () => boardOverview(projectId));
        return result(boardMarkdown(overview), overview);
      })
  );

  server.registerTool(
    "list_issues",
    {
      title: "List issues",
      description: "Lists issues as compact rows (key · title · column · priority · type · points · sprint · labels), filtered. Archived issues only with includeArchived.",
      inputSchema: listFilters,
      annotations: READ_ONLY,
    },
    (filters) =>
      guarded(async () => {
        const { total, rows } = await studio.read({ projectId: filters.projectId, collections: BOARD_SCOPE }, () => listIssues(filters));
        const more = total > rows.length ? `\n… ${total - rows.length} more; narrow the filters or raise limit.` : "";
        return result(rows.length ? rows.map(rowLine).join("\n") + more : "No issues match.", { total, issues: rows });
      })
  );

  server.registerTool(
    "get_issue",
    {
      title: "Get issue",
      description: "One issue in full: fields, description as Markdown, checklist progress and related assets.",
      inputSchema: z.object({ projectId: projectIdSchema, issue: issueIdSchema }),
      annotations: READ_ONLY,
    },
    ({ projectId, issue }) =>
      guarded(async () => {
        const id = await studio.read({ projectId, collections: BOARD_SCOPE }, () => findIssue(projectId, issue).id);
        const asset = await readAsset(ctx, projectId, { ref: { type: "issue", id } });
        const checklist = taskProgress((asset.json as unknown as Issue).description);
        const progress = checklist.total ? `\n\nChecklist: ${checklist.done}/${checklist.total} done` : "";
        const related = asset.related.map((r) => `- ${r.title} (${r.ref.type} ${r.ref.id})`).join("\n");
        const text = `${asset.markdown}${progress}\n\nOpen: ${asset.url}${related ? `\n\nRelated:\n${related}` : ""}`;
        return result(text, { ref: asset.ref, url: asset.url, issue: asset.json, checklist, related: asset.related });
      })
  );
}

function registerIssueWrites(ctx: ToolContext): void {
  const { server, studio } = ctx;

  server.registerTool(
    "create_issues",
    {
      title: "Create issues",
      description: `Creates up to ${MAX_ROWS} issues in one call with the next free keys, in order. Makes the Task Board if the project has none. New issues go to the backlog unless sprint is given.`,
      inputSchema: z.object({ projectId: projectIdSchema, issues: z.array(newIssueSchema).min(1).max(MAX_ROWS) }),
      annotations: WRITES,
    },
    ({ projectId, issues }) =>
      guarded(async () => {
        const hasLinks = issues.some((i) => i.linkTo?.length);
        const ids = issues.map(() => uuid());
        const rows = await studio.write({ projectId, collections: hasLinks ? "all" : BOARD_SCOPE }, () => createIssues(projectId, issues, ids));
        return result(`Created ${rows.length} issue${rows.length === 1 ? "" : "s"}:\n${rows.map((r) => `- ${r.key} ${r.title}: ${r.url}`).join("\n")}`, { issues: rows });
      })
  );

  server.registerTool(
    "update_issues",
    {
      title: "Update issues",
      description: `Changes up to ${MAX_ROWS} issues: fields, labels, column, sprint, order (before/after) and archive. Moves keep resolved dates and ordering like drag and drop in the app.`,
      inputSchema: z.object({ projectId: projectIdSchema, updates: z.array(issueUpdateSchema).min(1).max(MAX_ROWS) }),
      annotations: WRITES,
    },
    ({ projectId, updates }) =>
      guarded(async () => {
        const rows = await studio.write({ projectId, collections: BOARD_SCOPE }, () => updateIssues(projectId, updates));
        return result(`Updated:\n${rows.map(rowLine).join("\n")}`, { issues: rows });
      })
  );
}

function registerSprintWrites(ctx: ToolContext): void {
  const { server, studio } = ctx;

  server.registerTool(
    "create_sprint",
    {
      title: "Create sprint",
      description: "Adds a planned sprint, optionally starts it and moves issues into it. Only one sprint runs at a time.",
      inputSchema: newSprintSchema,
      annotations: WRITES,
    },
    (input) =>
      guarded(async () => {
        const sprintId = uuid();
        const sprint = await studio.write({ projectId: input.projectId, collections: BOARD_SCOPE }, () => addSprint(input, sprintId));
        return result(`${sprint.state === "active" ? "Started" : "Planned"} ${sprint.name} with ${sprint.issues.open + sprint.issues.done} issues (id ${sprint.id}).`, { sprint });
      })
  );

  server.registerTool(
    "complete_sprint",
    {
      title: "Complete sprint",
      description: "Completes a sprint like the app does: done issues are archived (still searchable), open ones move to the backlog or another sprint.",
      inputSchema: completeSchema,
      annotations: WRITES,
    },
    (input) =>
      guarded(async () => {
        const completion: Completion = { nextSprintId: uuid() };
        const summary = await studio.write({ projectId: input.projectId, collections: BOARD_SCOPE }, () => finishSprint(input, completion));
        return result(`Completed ${summary.sprint}: ${summary.archived} done issues archived, ${summary.moved} open issues moved to ${summary.movedTo}.`, summary);
      })
  );
}

export function registerBoardTools(ctx: ToolContext): void {
  registerBoardReads(ctx);
  registerIssueWrites(ctx);
  registerSprintWrites(ctx);
  registerCheckTaskTool(ctx);
}
