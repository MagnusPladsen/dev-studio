import {
  BookOpen,
  Bug,
  CheckSquare,
  ChevronDown,
  ChevronsDown,
  ChevronsUp,
  ChevronUp,
  Equal,
  Music,
  Paintbrush,
  PenTool,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { v4 as uuid } from "uuid";
import type { Board, BoardColumn, ColumnCategory, Issue, IssuePriority, IssueType } from "@/types";
import { storage } from "@/lib/storage";
import { issueKeyPrefix, issueNumber } from "@/lib/examples/board";
import { parseTask } from "@/lib/task-list";

export const TYPE_META: Record<IssueType, { label: string; icon: LucideIcon; color: string }> = {
  feature: { label: "Feature", icon: Sparkles, color: "#34d399" },
  bug: { label: "Bug", icon: Bug, color: "#f87171" },
  task: { label: "Task", icon: CheckSquare, color: "#60a5fa" },
  art: { label: "Art", icon: Paintbrush, color: "#a78bfa" },
  audio: { label: "Audio", icon: Music, color: "#fbbf24" },
  design: { label: "Design", icon: PenTool, color: "#f472b6" },
  writing: { label: "Writing", icon: BookOpen, color: "#fb923c" },
};
export const TYPES = Object.keys(TYPE_META) as IssueType[];

export const PRIORITY_META: Record<IssuePriority, { label: string; icon: LucideIcon; color: string; rank: number }> = {
  highest: { label: "Highest", icon: ChevronsUp, color: "#f87171", rank: 5 },
  high: { label: "High", icon: ChevronUp, color: "#fb923c", rank: 4 },
  medium: { label: "Medium", icon: Equal, color: "#fbbf24", rank: 3 },
  low: { label: "Low", icon: ChevronDown, color: "#60a5fa", rank: 2 },
  lowest: { label: "Lowest", icon: ChevronsDown, color: "#94a3b8", rank: 1 },
};
export const PRIORITIES = Object.keys(PRIORITY_META) as IssuePriority[];

export const CATEGORY_LABEL: Record<ColumnCategory, string> = { todo: "To do", doing: "In progress", done: "Done" };

export const COLUMN_COLORS = ["#94a3b8", "#60a5fa", "#fbbf24", "#a78bfa", "#f472b6", "#fb923c", "#34d399", "#2dd4bf"];

export const DEFAULT_COLUMNS: BoardColumn[] = [
  { id: "todo", name: "To Do", color: "#94a3b8", category: "todo" },
  { id: "in-progress", name: "In Progress", color: "#60a5fa", category: "doing" },
  { id: "testing", name: "Testing", color: "#fbbf24", category: "doing" },
  { id: "done", name: "Done", color: "#34d399", category: "done" },
];

export const DAY = 86_400_000;

/** The local calendar date as YYYY-MM-DD (not UTC, so it matches the user's own day). */
export function today(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function isOverdue(issue: Pick<Issue, "dueDate" | "resolvedAt">): boolean {
  return !!issue.dueDate && !issue.resolvedAt && issue.dueDate < today();
}

/** Quotes a CSV cell and defuses leading = + - @ so spreadsheets don't run it as a formula. */
export function csvCell(value: unknown): string {
  const text = String(value ?? "");
  const safe = /^[=+\-@]/.test(text) ? "'" + text : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** Byte order mark so Excel reads the CSV as UTF-8. */
export const CSV_BOM = "\uFEFF";

export function daysLeft(end?: string): number | null {
  if (!end) return null;
  return Math.ceil((Date.parse(end + "T23:59:59") - Date.now()) / DAY);
}

export function formatDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? iso + "T12:00:00" : iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function relativeTime(iso?: string): string {
  if (!iso) return "";
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} d ago`;
  return formatDate(iso);
}

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

export function saveBoard(projectId: string, board: Board, patch: Partial<Board>): Board {
  const next = { ...board, ...patch, updatedAt: new Date().toISOString() };
  storage.save("boards", next, projectId);
  return next;
}

export function columnOf(board: Board, id: string): BoardColumn | undefined {
  return board.columns.find((c) => c.id === id);
}

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
    order: siblings.reduce((m, i) => Math.max(m, i.order), 0) + 1000,
    createdAt: now,
    updatedAt: now,
    ...fields,
    status,
    resolvedAt: columnOf(b, status)?.category === "done" ? now : undefined,
  };
  storage.save("issues", issue, projectId);
  return { issue, board: b };
}

/** Closes a sprint: done issues are archived, open ones move to `targetSprintId` (null = backlog). */
export function completeSprint(projectId: string, board: Board, sprintId: string, targetSprintId: string | null): Board {
  const doneIds = new Set(board.columns.filter((c) => c.category === "done").map((c) => c.id));
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

export const fieldStyle: React.CSSProperties = {
  background: "var(--bg-primary)",
  color: "var(--text-primary)",
  border: "1px solid var(--border)",
};

export const secondaryBtn: React.CSSProperties = {
  color: "var(--text-primary)",
  border: "1px solid var(--border)",
  background: "var(--bg-card)",
};

export function TypeIcon({ type, className = "w-3.5 h-3.5" }: { type: IssueType; className?: string }) {
  const m = TYPE_META[type] ?? TYPE_META.task;
  const Icon = m.icon;
  return (
    <span title={m.label} aria-label={m.label} className="inline-flex shrink-0">
      <Icon className={className} style={{ color: m.color }} />
    </span>
  );
}

export function PriorityIcon({ priority, className = "w-3.5 h-3.5" }: { priority: IssuePriority; className?: string }) {
  const m = PRIORITY_META[priority] ?? PRIORITY_META.medium;
  const Icon = m.icon;
  return (
    <span title={`${m.label} priority`} aria-label={`${m.label} priority`} className="inline-flex shrink-0">
      <Icon className={className} style={{ color: m.color }} />
    </span>
  );
}

/**
 * Very small markdown → JSX for issue descriptions (headings, lists, task lists, bold/italic, code).
 * `onToggleTask` gets the line number of a ticked "- [ ]" item; without it the boxes are read-only.
 */
export function MiniMarkdown({ text, onToggleTask }: { text: string; onToggleTask?(line: number): void }) {
  const lines = text.split("\n");
  const out: React.ReactNode[] = [];
  let list: React.ReactNode[] = [];
  let ordered = false;
  const flush = () => {
    if (!list.length) return;
    out.push(
      ordered ? (
        <ol key={out.length} className="list-decimal pl-5 space-y-0.5">{list}</ol>
      ) : (
        <ul key={out.length} className="list-disc pl-5 space-y-0.5">{list}</ul>
      )
    );
    list = [];
  };
  const inline = (s: string, k: string): React.ReactNode[] =>
    s.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g).map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) return <strong key={k + i} style={{ color: "var(--text-primary)" }}>{part.slice(2, -2)}</strong>;
      if (part.startsWith("*") && part.endsWith("*") && part.length > 2) return <em key={k + i}>{part.slice(1, -1)}</em>;
      if (part.startsWith("`") && part.endsWith("`")) return <code key={k + i} className="px-1 rounded text-[0.9em]" style={{ background: "var(--bg-hover)" }}>{part.slice(1, -1)}</code>;
      return part;
    });
  lines.forEach((raw, i) => {
    const line = raw.replace(/\s+$/, "");
    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    const ol = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ul || ol) {
      if (list.length && ordered !== !!ol) flush();
      ordered = !!ol;
      const task = parseTask(line, i);
      list.push(
        task ? (
          <li key={i} className="list-none -ml-5 flex items-start gap-2">
            <input
              type="checkbox"
              checked={task.done}
              disabled={!onToggleTask}
              onClick={(e) => e.stopPropagation()}
              onChange={() => onToggleTask?.(i)}
              className="mt-1 shrink-0"
              aria-label={task.text}
            />
            <span style={task.done ? { textDecoration: "line-through", color: "var(--text-muted)" } : undefined}>{inline(task.text, `t${i}`)}</span>
          </li>
        ) : (
          <li key={i}>{inline((ul ?? ol)![1], `l${i}`)}</li>
        )
      );
      return;
    }
    flush();
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) out.push(<p key={i} className="font-semibold mt-2" style={{ color: "var(--text-primary)" }}>{inline(h[2], `h${i}`)}</p>);
    else if (line.trim()) out.push(<p key={i}>{inline(line, `p${i}`)}</p>);
    else out.push(<div key={i} className="h-2" />);
  });
  flush();
  return <div className="text-sm leading-relaxed space-y-1" style={{ color: "var(--text-secondary)" }}>{out}</div>;
}
