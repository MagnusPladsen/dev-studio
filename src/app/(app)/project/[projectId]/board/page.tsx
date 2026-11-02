"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { createPortal } from "react-dom";
import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Flag,
  Link2,
  ListChecks,
  MoreHorizontal,
  NotebookPen,
  Play,
  Plus,
  Search,
  SquareKanban,
  Trash2,
  X,
} from "lucide-react";
import { v4 as uuid } from "uuid";
import type { Board, BoardColumn, ColumnCategory, Issue, IssuePriority, IssueType, Sprint } from "@/types";
import { storage } from "@/lib/storage";
import { getRelated } from "@/lib/links";
import { useOpenParam, useTrackOpenAsset, useStorageVersion } from "@/hooks/useStorage";
import { useHistory } from "@/hooks/useHistory";
import { UndoRedoButtons } from "@/components/UndoRedoButtons";
import { ExportMenu } from "@/components/ExportMenu";
import { HelpButton } from "@/components/HelpButton";
import { ExamplesBar } from "@/components/ExamplesBar";
import { SaveIndicator } from "@/components/SaveIndicator";
import { useAssetMenu } from "@/components/AssetContextMenu";
import { AssetMenuButton, AssetPinButton, PasteButton } from "@/components/AssetMenuButton";
import { IssueDetail } from "@/components/board/IssueDetail";
import { positionMenu, type MenuPlacement } from "@/lib/menu-position";
import {
  CATEGORY_LABEL,
  COLUMN_COLORS,
  CSV_BOM,
  DAY,
  PRIORITIES,
  PRIORITY_META,
  PriorityIcon,
  TYPES,
  TYPE_META,
  TypeIcon,
  createDefaultBoard,
  createIssue,
  csvCell,
  daysLeft,
  fieldStyle,
  formatDate,
  isOverdue,
  relativeTime,
  saveBoard,
  saveIssue,
  secondaryBtn,
  today,
} from "@/components/board/meta";
import { APP } from "@/lib/app-config";

const MOVE_MENU_WIDTH = 176;
const MOVE_MENU_ROW_HEIGHT = 30;
const MOVE_MENU_PADDING = 32;

type View = "board" | "backlog" | "all";
type Filters = { q: string; type: IssueType | ""; priority: IssuePriority | ""; label: string };
const NO_FILTERS: Filters = { q: "", type: "", priority: "", label: "" };

const byOrder = (a: Issue, b: Issue) => a.order - b.order || a.createdAt.localeCompare(b.createdAt);

function matches(i: Issue, f: Filters): boolean {
  if (f.type && i.type !== f.type) return false;
  if (f.priority && i.priority !== f.priority) return false;
  if (f.label && !i.labels.includes(f.label)) return false;
  const q = f.q.trim().toLowerCase();
  if (!q) return true;
  return [i.key, i.title, i.description, ...i.labels].some((s) => s?.toLowerCase().includes(q));
}

function download(name: string, text: string, type: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  return !!t?.closest("input, textarea, select, [contenteditable=true]");
}

// ─────────────────────────────────────────────────────────────────────────────

export default function TaskBoardPage() {
  const projectId = useParams().projectId as string;
  const version = useStorageVersion();
  const [view, setView] = useState<View>("board");
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState<null | Partial<Issue>>(null);
  const [completing, setCompleting] = useState<Sprint | null>(null);

  // the project's one board, created on first visit
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const storedBoard = useMemo(() => storage.getAll("boards", projectId)[0], [projectId, version]);
  useEffect(() => {
    if (!storedBoard) createDefaultBoard(projectId);
  }, [storedBoard, projectId]);
  const board = storedBoard;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const issues = useMemo(() => storage.getAll("issues", projectId), [projectId, version]);

  // undo/redo covers the board setup and every issue (moves, edits, create/delete)
  // keyed on content, so unrelated storage changes (e.g. notes) don't create empty undo steps
  const issuesKey = issues.map((i) => `${i.id}@${i.updatedAt}:${i.order}`).join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const snapshot = useMemo(() => ({ board, issues }), [board?.updatedAt, issuesKey]);
  const restore = useCallback(
    (snap: { board?: Board; issues: Issue[] }) => {
      if (snap.board) storage.save("boards", snap.board, projectId);
      const current = storage.getAll("issues", projectId);
      const want = new Map(snap.issues.map((i) => [i.id, i]));
      for (const c of current) if (!want.has(c.id)) storage.delete("issues", c.id, projectId);
      for (const w of snap.issues) {
        const c = current.find((x) => x.id === w.id);
        if (c !== w) storage.save("issues", w, projectId);
      }
    },
    [projectId]
  );
  const history = useHistory(snapshot, restore, board?.id);

  useOpenParam((id) => {
    if (storage.getById("issues", id, projectId)) setOpenId(id);
  }, !!board);
  useTrackOpenAsset(openId ? { type: "issue", id: openId } : null);

  const openIssue = openId ? issues.find((i) => i.id === openId) : undefined;

  // "c" creates an issue, like Jira
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "c" || e.metaKey || e.ctrlKey || e.altKey || isTyping(e) || creating || completing) return;
      e.preventDefault();
      setCreating({});
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [creating, completing]);

  if (!board) {
    return (
      <div className="h-full flex items-center justify-center text-sm" style={{ color: "var(--text-secondary)" }}>
        Setting up your board…
      </div>
    );
  }

  const activeSprint = board.sprints.find((s) => s.state === "active");
  const labels = [...new Set(issues.flatMap((i) => i.labels))].sort();

  function exportCsv() {
    const col = (id: string) => board!.columns.find((c) => c.id === id)?.name ?? id;
    const sprint = (id: string | null) => (id ? board!.sprints.find((s) => s.id === id)?.name ?? "" : "Backlog");
    const head = ["Key", "Title", "Type", "Priority", "Status", "Sprint", "Points", "Due", "Labels", "Archived", "Created", "Updated", "Description"];
    const rows = [...issues]
      .sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }))
      .map((i) =>
        [i.key, i.title, TYPE_META[i.type]?.label, PRIORITY_META[i.priority]?.label, col(i.status), sprint(i.sprintId), i.points ?? "", i.dueDate ?? "", i.labels.join(" "), i.archived ? "yes" : "no", i.createdAt, i.updatedAt, i.description]
          .map(csvCell)
          .join(",")
      );
    download(`${board!.keyPrefix.toLowerCase()}-issues.csv`, CSV_BOM + [head.map(csvCell).join(","), ...rows].join("\n"), "text/csv");
  }

  return (
    <div className="relative h-full flex flex-col min-h-0">
      {/* Header */}
      <div className="shrink-0 border-b px-3 md:px-4 py-2 flex flex-wrap items-center gap-2" style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}>
        <UndoRedoButtons history={history} />
        <div className="flex items-center gap-2 mr-1">
          <SquareKanban className="w-4 h-4" style={{ color: "var(--tool-color, var(--accent))" }} />
          <h1 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Task Board
          </h1>
        </div>
        <div role="tablist" aria-label="View" className="flex rounded-lg p-0.5" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}>
          {(
            [
              ["board", "Board"],
              ["backlog", "Backlog"],
              ["all", "All issues"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className="px-2.5 py-1 rounded-md text-xs font-medium"
              style={{ background: view === v ? "var(--bg-hover)" : "transparent", color: view === v ? "var(--text-primary)" : "var(--text-secondary)" }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <SaveIndicator state="saved" className="hidden sm:inline-flex" />
          <HelpButton topic="board" />
          <ExportMenu
            items={[
              { label: "CSV (all issues)", description: "Opens in any spreadsheet", onClick: exportCsv },
              {
                label: "JSON",
                description: "Board, columns, sprints and issues",
                onClick: () => download(`${board.keyPrefix.toLowerCase()}-board.json`, JSON.stringify({ board, issues }, null, 2), "application/json"),
              },
            ]}
          />
          <button
            onClick={() => setCreating({ sprintId: view === "backlog" ? null : activeSprint?.id ?? null })}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold"
            style={{ background: "var(--accent)" }}
            title="Create issue (C)"
          >
            <Plus className="w-3.5 h-3.5" /> Create issue
          </button>
          <PasteButton type="issue" />
        </div>
      </div>

      {view !== "backlog" && (
        <FilterBar filters={filters} setFilters={setFilters} labels={labels} />
      )}

      <div className="flex-1 min-h-0 overflow-auto">
        {issues.length === 0 ? (
          <EmptyState projectId={projectId} onCreate={() => setCreating({})} />
        ) : view === "board" ? (
          <BoardView
            projectId={projectId}
            board={board}
            issues={issues}
            filters={filters}
            activeSprint={activeSprint}
            onOpen={setOpenId}
            onCompleteSprint={setCompleting}
            onGoBacklog={() => setView("backlog")}
          />
        ) : view === "backlog" ? (
          <BacklogView projectId={projectId} board={board} issues={issues} onOpen={setOpenId} onCompleteSprint={setCompleting} />
        ) : (
          <AllIssuesView projectId={projectId} board={board} issues={issues} filters={filters} onOpen={setOpenId} />
        )}
        {issues.length > 0 && (
          <div className="px-4 pb-4">
            <ExamplesBar projectId={projectId} collections={["issues"]} />
          </div>
        )}
      </div>

      {openIssue && <IssueDetail key={openIssue.id} projectId={projectId} board={board} issue={openIssue} onClose={() => setOpenId(null)} />}

      {creating && (
        <CreateIssueDialog
          projectId={projectId}
          board={board}
          initial={creating}
          onClose={() => setCreating(null)}
          onCreated={(id) => {
            setCreating(null);
            setOpenId(id);
          }}
        />
      )}

      {completing && <CompleteSprintDialog projectId={projectId} board={board} sprint={completing} issues={issues} onClose={() => setCompleting(null)} />}
    </div>
  );
}

// ─── filters ─────────────────────────────────────────────────────────────────

function FilterBar({ filters, setFilters, labels }: { filters: Filters; setFilters(f: Filters): void; labels: string[] }) {
  const active = filters.q || filters.type || filters.priority || filters.label;
  const sel = "px-2 py-1 rounded-md text-xs outline-none";
  return (
    <div className="shrink-0 px-3 md:px-4 py-2 flex flex-wrap items-center gap-2 border-b" style={{ borderColor: "var(--border)" }}>
      <div className="flex items-center gap-1.5 px-2 py-1 rounded-md flex-1 min-w-40 max-w-xs" style={fieldStyle}>
        <Search className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--text-muted)" }} />
        <input
          value={filters.q}
          onChange={(e) => setFilters({ ...filters, q: e.target.value })}
          placeholder="Search issues"
          className="bg-transparent text-xs outline-none w-full"
          style={{ color: "var(--text-primary)" }}
          aria-label="Search issues"
        />
      </div>
      <select value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value as IssueType | "" })} className={sel} style={fieldStyle} aria-label="Filter by type">
        <option value="">All types</option>
        {TYPES.map((t) => (
          <option key={t} value={t}>
            {TYPE_META[t].label}
          </option>
        ))}
      </select>
      <select value={filters.priority} onChange={(e) => setFilters({ ...filters, priority: e.target.value as IssuePriority | "" })} className={sel} style={fieldStyle} aria-label="Filter by priority">
        <option value="">Any priority</option>
        {PRIORITIES.map((p) => (
          <option key={p} value={p}>
            {PRIORITY_META[p].label}
          </option>
        ))}
      </select>
      {labels.length > 0 && (
        <select value={filters.label} onChange={(e) => setFilters({ ...filters, label: e.target.value })} className={sel} style={fieldStyle} aria-label="Filter by label">
          <option value="">Any label</option>
          {labels.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      )}
      {active && (
        <button onClick={() => setFilters(NO_FILTERS)} className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs" style={secondaryBtn}>
          <X className="w-3 h-3" /> Clear
        </button>
      )}
    </div>
  );
}

// ─── board view ──────────────────────────────────────────────────────────────

function sprintStats(board: Board, issues: Issue[]) {
  const done = issues.filter((i) => board.columns.find((c) => c.id === i.status)?.category === "done");
  const pts = (list: Issue[]) => list.reduce((n, i) => n + (i.points ?? 0), 0);
  const total = pts(issues);
  return total > 0
    ? { done: pts(done), total, unit: "points", doneCount: done.length, count: issues.length }
    : { done: done.length, total: issues.length, unit: "issues", doneCount: done.length, count: issues.length };
}

function BoardView({
  projectId,
  board,
  issues,
  filters,
  activeSprint,
  onOpen,
  onCompleteSprint,
  onGoBacklog,
}: {
  projectId: string;
  board: Board;
  issues: Issue[];
  filters: Filters;
  activeSprint?: Sprint;
  onOpen(id: string): void;
  onCompleteSprint(s: Sprint): void;
  onGoBacklog(): void;
}) {
  const dragId = useRef<string | null>(null);
  const [dropAt, setDropAt] = useState<{ col: string; before: string | null } | null>(null);

  const onBoard = issues.filter((i) => !i.archived && (activeSprint ? i.sprintId === activeSprint.id : true));
  const shown = onBoard.filter((i) => matches(i, filters));
  const doneIds = new Set(board.columns.filter((c) => c.category === "done").map((c) => c.id));
  const doneOnBoard = onBoard.filter((i) => doneIds.has(i.status));

  function move(id: string, status: string, before: string | null) {
    const moving = storage.getById("issues", id, projectId);
    if (!moving) return;
    const list = onBoard.filter((i) => i.status === status && i.id !== id).sort(byOrder);
    let at = before ? list.findIndex((i) => i.id === before) : list.length;
    if (at < 0) at = list.length;
    list.splice(at, 0, moving);
    list.forEach((issue, idx) => {
      const order = (idx + 1) * 1000;
      if (issue.id === id) saveIssue(projectId, board, issue, { status, order });
      else if (issue.order !== order) storage.save("issues", { ...issue, order }, projectId);
    });
  }

  function addColumn() {
    const used = new Set(board.columns.map((c) => c.color));
    const col: BoardColumn = {
      id: uuid(),
      name: "New column",
      color: COLUMN_COLORS.find((c) => !used.has(c)) ?? COLUMN_COLORS[0],
      category: "doing",
    };
    const doneAt = board.columns.findIndex((c) => c.category === "done");
    const columns = [...board.columns];
    columns.splice(doneAt === -1 ? columns.length : doneAt, 0, col);
    saveBoard(projectId, board, { columns });
  }

  const stats = activeSprint ? sprintStats(board, onBoard) : null;
  const left = activeSprint ? daysLeft(activeSprint.endDate) : null;

  return (
    <div className="flex flex-col h-full min-h-[420px]">
      {activeSprint ? (
        <div className="shrink-0 px-3 md:px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-b" style={{ borderColor: "var(--border)" }}>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Flag className="w-3.5 h-3.5" style={{ color: "var(--tool-color, var(--accent))" }} />
              <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                {activeSprint.name}
              </span>
              {activeSprint.startDate && (
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {formatDate(activeSprint.startDate)} – {formatDate(activeSprint.endDate)}
                </span>
              )}
              {left !== null && (
                <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: left < 0 ? "rgba(248,113,113,0.15)" : "var(--bg-hover)", color: left < 0 ? "var(--red)" : "var(--text-secondary)" }}>
                  {left < 0 ? `${-left} d over` : left === 0 ? "Ends today" : `${left} d left`}
                </span>
              )}
            </div>
            {activeSprint.goal && (
              <p className="text-xs mt-0.5 truncate" style={{ color: "var(--text-secondary)" }}>
                Goal: {activeSprint.goal}
              </p>
            )}
          </div>
          {stats && (
            <div className="flex items-center gap-2 min-w-48 flex-1 max-w-sm" title={`${stats.doneCount} of ${stats.count} issues done`}>
              <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-hover)" }}>
                <div className="h-full rounded-full" style={{ width: `${stats.total ? (stats.done / stats.total) * 100 : 0}%`, background: "var(--green)" }} />
              </div>
              <span className="text-xs tabular-nums whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
                {stats.done}/{stats.total} {stats.unit}
              </span>
            </div>
          )}
          <button onClick={() => onCompleteSprint(activeSprint)} className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs" style={secondaryBtn}>
            <ListChecks className="w-3.5 h-3.5" /> Complete sprint
          </button>
        </div>
      ) : (
        <div className="shrink-0 px-3 md:px-4 py-2 flex flex-wrap items-center gap-2 text-xs border-b" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
          <span>
            No active sprint, so every open issue is on the board.{" "}
            <button onClick={onGoBacklog} className="underline" style={{ color: "var(--text-secondary)" }}>
              Plan a sprint in Backlog
            </button>
          </span>
          {doneOnBoard.length > 0 && (
            <button
              onClick={() => doneOnBoard.forEach((i) => saveIssue(projectId, board, i, { archived: true }))}
              className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md"
              style={secondaryBtn}
              title="Take finished issues off the board. They stay in All issues, searchable and linkable."
            >
              <Archive className="w-3.5 h-3.5" /> Archive done ({doneOnBoard.length})
            </button>
          )}
        </div>
      )}

      <div className="flex-1 min-h-0 flex gap-3 p-3 md:p-4 overflow-x-auto snap-x snap-mandatory md:snap-none items-start">
        {board.columns.map((col, ci) => {
          const list = shown.filter((i) => i.status === col.id).sort(byOrder);
          const count = onBoard.filter((i) => i.status === col.id).length;
          return (
            <section
              key={col.id}
              className="flex flex-col shrink-0 w-[85vw] max-w-[340px] md:w-72 snap-start rounded-xl max-h-full"
              style={{
                background: "var(--bg-secondary)",
                border: `1px solid ${dropAt?.col === col.id ? col.color : "var(--border)"}`,
              }}
              onDragOver={(e) => {
                e.preventDefault();
                if (dropAt?.col !== col.id || dropAt.before !== null) setDropAt({ col: col.id, before: null });
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropAt(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                const id = dragId.current ?? e.dataTransfer.getData("text/plain");
                if (id) move(id, col.id, dropAt?.col === col.id ? dropAt.before : null);
                dragId.current = null;
                setDropAt(null);
              }}
              aria-label={`${col.name} column`}
            >
              <ColumnHeader projectId={projectId} board={board} column={col} index={ci} count={count} issues={issues} />
              <div className="flex-1 min-h-12 overflow-y-auto px-2 pb-2 space-y-2">
                {list.map((issue) => (
                  <div key={issue.id}>
                    {dropAt?.col === col.id && dropAt.before === issue.id && <div className="h-0.5 rounded mb-2" style={{ background: col.color }} />}
                    <IssueCard
                      projectId={projectId}
                      board={board}
                      issue={issue}
                      onOpen={() => onOpen(issue.id)}
                      onMove={(status) => move(issue.id, status, null)}
                      onDragStart={(e) => {
                        dragId.current = issue.id;
                        e.dataTransfer.setData("text/plain", issue.id);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragOverCard={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const r = e.currentTarget.getBoundingClientRect();
                        const after = e.clientY > r.top + r.height / 2;
                        const idx = list.findIndex((x) => x.id === issue.id);
                        const before = after ? list[idx + 1]?.id ?? null : issue.id;
                        if (dropAt?.col !== col.id || dropAt.before !== before) setDropAt({ col: col.id, before });
                      }}
                    />
                  </div>
                ))}
                {dropAt?.col === col.id && dropAt.before === null && list.length > 0 && <div className="h-0.5 rounded" style={{ background: col.color }} />}
              </div>
              <QuickAdd
                onAdd={(title) => createIssue(projectId, board, { title, status: col.id, sprintId: board.sprints.find((s) => s.state === "active")?.id ?? null })}
              />
            </section>
          );
        })}
        <button
          onClick={addColumn}
          className="shrink-0 w-[60vw] max-w-[220px] md:w-48 h-11 snap-start rounded-xl inline-flex items-center justify-center gap-1.5 text-xs"
          style={{ border: "1px dashed var(--border-hover)", color: "var(--text-secondary)" }}
        >
          <Plus className="w-3.5 h-3.5" /> Add column
        </button>
      </div>
    </div>
  );
}

function QuickAdd({ onAdd, placeholder = "What needs to be done?" }: { onAdd(title: string): void; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  if (!open)
    return (
      <button onClick={() => setOpen(true)} className="m-2 mt-0 inline-flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs text-left hover:bg-[var(--bg-hover)]" style={{ color: "var(--text-secondary)" }}>
        <Plus className="w-3.5 h-3.5" /> Add issue
      </button>
    );
  return (
    <form
      className="m-2 mt-0"
      onSubmit={(e) => {
        e.preventDefault();
        if (title.trim()) onAdd(title.trim());
        setTitle("");
      }}
    >
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => !title.trim() && setOpen(false)}
        onKeyDown={(e) => e.key === "Escape" && (setTitle(""), setOpen(false))}
        placeholder={placeholder}
        className="w-full px-2 py-1.5 rounded-md text-xs outline-none"
        style={fieldStyle}
        aria-label="New issue title"
      />
      <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
        Enter to add, Esc to stop
      </p>
    </form>
  );
}

function ColumnHeader({
  projectId,
  board,
  column,
  index,
  count,
  issues,
}: {
  projectId: string;
  board: Board;
  column: BoardColumn;
  index: number;
  count: number;
  issues: Issue[];
}) {
  const [menu, setMenu] = useState(false);
  const [name, setName] = useState(column.name);
  const [moveTo, setMoveTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setMenu(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [menu]);

  const patch = (p: Partial<BoardColumn>) => saveBoard(projectId, board, { columns: board.columns.map((c) => (c.id === column.id ? { ...c, ...p } : c)) });
  const doneCount = board.columns.filter((c) => c.category === "done").length;
  const inColumn = issues.filter((i) => i.status === column.id);
  const others = board.columns.filter((c) => c.id !== column.id);

  function setCategory(category: ColumnCategory) {
    if (column.category === "done" && category !== "done" && doneCount === 1) {
      setError("Keep at least one Done column, so finished work can be counted.");
      return;
    }
    setError(null);
    patch({ category });
    const done = category === "done";
    for (const i of inColumn) {
      if (done && !i.resolvedAt) storage.save("issues", { ...i, resolvedAt: new Date().toISOString() }, projectId);
      if (!done && i.resolvedAt) storage.save("issues", { ...i, resolvedAt: undefined }, projectId);
    }
  }

  function shift(dir: -1 | 1) {
    const j = index + dir;
    if (j < 0 || j >= board.columns.length) return;
    const columns = [...board.columns];
    [columns[index], columns[j]] = [columns[j], columns[index]];
    saveBoard(projectId, board, { columns });
  }

  function remove() {
    if (board.columns.length === 1) return setError("A board needs at least one column.");
    if (column.category === "done" && doneCount === 1) return setError("Keep at least one Done column.");
    if (inColumn.length) {
      const target = board.columns.find((c) => c.id === moveTo);
      if (!target) return setError("Choose where its issues should go.");
      for (const i of inColumn) saveIssue(projectId, board, i, { status: target.id });
    }
    saveBoard(projectId, board, { columns: board.columns.filter((c) => c.id !== column.id) });
  }

  return (
    <div ref={ref} className="relative flex items-center gap-2 px-3 pt-3 pb-2">
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: column.color }} />
      <h2 className="text-xs font-semibold uppercase tracking-wide truncate" style={{ color: "var(--text-primary)" }}>
        {column.name}
      </h2>
      <span className="text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
        {count}
      </span>
      {column.category === "done" && (
        <span className="text-[10px] px-1 rounded" style={{ color: "var(--green)", border: "1px solid rgba(52,211,153,0.3)" }} title="Issues here count as finished">
          Done
        </span>
      )}
      <button
        onClick={() => {
          setName(column.name);
          setError(null);
          setMenu((m) => !m);
        }}
        className="ml-auto p-1 rounded-md" style={{ color: "var(--text-secondary)" }} aria-label={`Column options for ${column.name}`} title="Column options">
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {menu && (
        <div className="absolute right-2 top-full z-30 w-64 p-3 rounded-lg shadow-xl space-y-3" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
          <label className="block text-[11px] space-y-1" style={{ color: "var(--text-muted)" }}>
            Name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => name.trim() && name !== column.name && patch({ name: name.trim() })}
              onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
              className="w-full px-2 py-1.5 rounded-md text-xs outline-none"
              style={fieldStyle}
            />
          </label>
          <div className="space-y-1">
            <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              Colour
            </span>
            <div className="flex gap-1.5 flex-wrap">
              {COLUMN_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => patch({ color: c })}
                  className="w-5 h-5 rounded-full"
                  style={{ background: c, outline: column.color === c ? "2px solid var(--text-primary)" : "none", outlineOffset: 2 }}
                  aria-label={`Colour ${c}`}
                />
              ))}
            </div>
          </div>
          <label className="block text-[11px] space-y-1" style={{ color: "var(--text-muted)" }}>
            Counts as
            <select value={column.category} onChange={(e) => setCategory(e.target.value as ColumnCategory)} className="w-full px-2 py-1.5 rounded-md text-xs outline-none" style={fieldStyle}>
              {(Object.keys(CATEGORY_LABEL) as ColumnCategory[]).map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-1.5">
            <button onClick={() => shift(-1)} disabled={index === 0} className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-xs disabled:opacity-40" style={secondaryBtn}>
              <ChevronLeft className="w-3.5 h-3.5" /> Move left
            </button>
            <button onClick={() => shift(1)} disabled={index === board.columns.length - 1} className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-xs disabled:opacity-40" style={secondaryBtn}>
              Move right <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="pt-2 space-y-1.5 border-t" style={{ borderColor: "var(--border)" }}>
            {inColumn.length > 0 && (
              <select value={moveTo} onChange={(e) => setMoveTo(e.target.value)} className="w-full px-2 py-1.5 rounded-md text-xs outline-none" style={fieldStyle} aria-label="Move its issues to">
                <option value="">Move its {inColumn.length} issue{inColumn.length === 1 ? "" : "s"} to…</option>
                {others.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
            <button onClick={remove} className="w-full inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs" style={{ color: "var(--red)", border: "1px solid var(--border)" }}>
              <Trash2 className="w-3.5 h-3.5" /> Delete column
            </button>
          </div>
          {error && (
            <p className="text-[11px]" style={{ color: "var(--red)" }}>
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function IssueCard({
  projectId,
  board,
  issue,
  onOpen,
  onMove,
  onDragStart,
  onDragOverCard,
}: {
  projectId: string;
  board: Board;
  issue: Issue;
  onOpen(): void;
  onMove(status: string): void;
  onDragStart(e: React.DragEvent): void;
  onDragOverCard(e: React.DragEvent<HTMLDivElement>): void;
}) {
  const version = useStorageVersion();
  const { assetTriggerProps } = useAssetMenu();
  const trigger = assetTriggerProps({ type: "issue", id: issue.id });
  const [menu, setMenu] = useState<MenuPlacement | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const related = useMemo(
    () => getRelated(projectId, "issue", issue.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectId, issue.id, version]
  );
  const noteCount = related.filter((r) => r.type === "note").length;
  const linkCount = related.length - noteCount;
  const overdue = isOverdue(issue);
  const done = !!issue.resolvedAt;

  useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!menuRef.current?.contains(target) && !menuButtonRef.current?.contains(target)) setMenu(null);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenu(null);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [menu]);

  return (
    <div
      {...trigger}
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOverCard}
      onClick={onOpen}
      onKeyDown={(e) => {
        trigger.onKeyDown(e);
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`${issue.key} ${issue.title}`}
      className="group relative rounded-lg p-2.5 cursor-pointer select-none transition-colors hover:border-[var(--border-hover)]"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)", boxShadow: "0 1px 2px rgba(0,0,0,0.25)" }}
    >
      <p className="text-[13px] leading-snug pr-6" style={{ color: done ? "var(--text-secondary)" : "var(--text-primary)", textDecoration: done ? "line-through" : undefined, textDecorationColor: "var(--text-muted)" }}>
        {issue.title}
      </p>
      {issue.labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {issue.labels.slice(0, 3).map((l) => (
            <span key={l} className="text-[10px] px-1.5 py-px rounded" style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}>
              {l}
            </span>
          ))}
          {issue.labels.length > 3 && (
            <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
              +{issue.labels.length - 3}
            </span>
          )}
        </div>
      )}
      <div className="flex items-center gap-2 mt-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
        <TypeIcon type={issue.type} />
        <span className="font-mono" style={{ color: "var(--text-secondary)" }}>
          {issue.key}
        </span>
        {issue.dueDate && (
          <span className="inline-flex items-center gap-0.5" style={{ color: overdue ? "var(--red)" : undefined }} title={overdue ? "Overdue" : "Due date"}>
            <CalendarDays className="w-3 h-3" />
            {formatDate(issue.dueDate)}
          </span>
        )}
        {linkCount > 0 && (
          <span className="inline-flex items-center gap-0.5" title={`${linkCount} linked asset${linkCount === 1 ? "" : "s"}`}>
            <Link2 className="w-3 h-3" />
            {linkCount}
          </span>
        )}
        {noteCount > 0 && (
          <span className="inline-flex items-center gap-0.5" title={`${noteCount} note${noteCount === 1 ? "" : "s"}`}>
            <NotebookPen className="w-3 h-3" />
            {noteCount}
          </span>
        )}
        <span className="ml-auto inline-flex items-center gap-1.5">
          <PriorityIcon priority={issue.priority} />
          {issue.points !== undefined && (
            <span className="min-w-5 text-center px-1 rounded-full tabular-nums" style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }} title="Story points">
              {issue.points}
            </span>
          )}
        </span>
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          const rect = e.currentTarget.getBoundingClientRect();
          const rows = board.columns.length + (done ? 1 : 0);
          const size = { width: MOVE_MENU_WIDTH, height: MOVE_MENU_ROW_HEIGHT * rows + MOVE_MENU_PADDING };
          setMenu((open) => (open ? null : positionMenu({ x: rect.right - size.width, y: rect.bottom + 4 }, size, { width: innerWidth, height: innerHeight })));
        }}
        ref={menuButtonRef}
        className="absolute top-1.5 right-1.5 p-1 rounded-md md:opacity-0 md:group-hover:opacity-100 focus:opacity-100 max-md:after:absolute max-md:after:-inset-[11px] max-md:after:content-['']"
        style={{ color: "var(--text-secondary)", background: "var(--bg-card)" }}
        aria-label={`Move ${issue.key}`}
        title="Move to…"
      >
        <MoreHorizontal className="w-3.5 h-3.5" />
      </button>
      {menu && createPortal(
        <div
          ref={menuRef}
          className="fixed z-50 w-44 p-1 rounded-lg shadow-xl overflow-y-auto"
          style={{ ...menu, background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
          onClick={(e) => e.stopPropagation()}
          onMouseLeave={() => setMenu(null)}
        >
          <p className="px-2 py-1 text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            Move to
          </p>
          {board.columns
            .filter((c) => c.id !== issue.status)
            .map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  onMove(c.id);
                  setMenu(null);
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-left hover:bg-[var(--bg-hover)]"
                style={{ color: "var(--text-primary)" }}
              >
                <span className="w-2 h-2 rounded-full" style={{ background: c.color }} />
                {c.name}
              </button>
            ))}
          {done && (
            <button
              onClick={() => {
                saveIssue(projectId, board, issue, { archived: true });
                setMenu(null);
              }}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-left hover:bg-[var(--bg-hover)]"
              style={{ color: "var(--text-primary)" }}
            >
              <Archive className="w-3 h-3" /> Archive
            </button>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}

// ─── backlog view ────────────────────────────────────────────────────────────

function BacklogView({
  projectId,
  board,
  issues,
  onOpen,
  onCompleteSprint,
}: {
  projectId: string;
  board: Board;
  issues: Issue[];
  onOpen(id: string): void;
  onCompleteSprint(s: Sprint): void;
}) {
  const { assetTriggerProps } = useAssetMenu();
  const dragId = useRef<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const open = issues.filter((i) => !i.archived);
  const active = board.sprints.find((s) => s.state === "active");
  const planned = board.sprints.filter((s) => s.state === "planned");
  const sections: { sprint: Sprint | null }[] = [...(active ? [{ sprint: active }] : []), ...planned.map((s) => ({ sprint: s })), { sprint: null }];

  function moveTo(issueId: string, sprintId: string | null, before: string | null) {
    const moving = storage.getById("issues", issueId, projectId);
    if (!moving) return;
    const list = open.filter((i) => i.sprintId === sprintId && i.id !== issueId).sort(byOrder);
    let at = before ? list.findIndex((i) => i.id === before) : list.length;
    if (at < 0) at = list.length;
    list.splice(at, 0, moving);
    list.forEach((issue, idx) => {
      const order = (idx + 1) * 1000;
      if (issue.id === issueId) saveIssue(projectId, board, issue, { sprintId, order });
      else if (issue.order !== order) storage.save("issues", { ...issue, order }, projectId);
    });
  }

  function createSprint() {
    const n = board.sprints.length + 1;
    const sprint: Sprint = { id: uuid(), name: `Sprint ${n}`, state: "planned" };
    saveBoard(projectId, board, { sprints: [...board.sprints, sprint] });
  }

  const patchSprint = (id: string, p: Partial<Sprint>) => saveBoard(projectId, board, { sprints: board.sprints.map((s) => (s.id === id ? { ...s, ...p } : s)) });

  function startSprint(s: Sprint) {
    const start = s.startDate || today();
    const end = s.endDate || new Date(Date.parse(start) + 13 * DAY).toISOString().slice(0, 10);
    patchSprint(s.id, { state: "active", startDate: start, endDate: end });
  }

  function deleteSprint(s: Sprint) {
    if (!confirm(`Delete "${s.name}"? Its issues go back to the backlog.`)) return;
    for (const i of issues.filter((x) => x.sprintId === s.id)) saveIssue(projectId, board, i, { sprintId: null });
    saveBoard(projectId, board, { sprints: board.sprints.filter((x) => x.id !== s.id) });
  }

  const closed = board.sprints.filter((s) => s.state === "closed");

  return (
    <div className="p-3 md:p-4 space-y-4 max-w-5xl">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs flex-1 min-w-60" style={{ color: "var(--text-muted)" }}>
          Plan work in sprints: drag issues from the backlog into a sprint, start it, and the board shows only that sprint. Completing a sprint archives what&rsquo;s done.
        </p>
        <button onClick={createSprint} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs" style={secondaryBtn}>
          <Plus className="w-3.5 h-3.5" /> Create sprint
        </button>
      </div>

      {sections.map(({ sprint }) => {
        const key = sprint?.id ?? "backlog";
        const list = open.filter((i) => i.sprintId === (sprint?.id ?? null)).sort(byOrder);
        const stats = sprintStats(board, list);
        return (
          <section
            key={key}
            className="rounded-xl"
            style={{ background: "var(--bg-secondary)", border: `1px solid ${over === key ? "var(--tool-color, var(--accent))" : "var(--border)"}` }}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(key);
            }}
            onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setOver(null)}
            onDrop={(e) => {
              e.preventDefault();
              const id = dragId.current ?? e.dataTransfer.getData("text/plain");
              if (id) moveTo(id, sprint?.id ?? null, null);
              dragId.current = null;
              setOver(null);
            }}
          >
            <div className="px-3 py-2.5 flex flex-wrap items-center gap-2 border-b" style={{ borderColor: "var(--border)" }}>
              {sprint ? (
                <>
                  <input
                    defaultValue={sprint.name}
                    onBlur={(e) => e.target.value.trim() && e.target.value !== sprint.name && patchSprint(sprint.id, { name: e.target.value.trim() })}
                    className="bg-transparent text-sm font-semibold outline-none w-36 rounded px-1 focus:bg-[var(--bg-primary)]"
                    style={{ color: "var(--text-primary)" }}
                    aria-label="Sprint name"
                  />
                  {sprint.state === "active" && (
                    <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded" style={{ background: "rgba(52,211,153,0.15)", color: "var(--green)" }}>
                      Active
                    </span>
                  )}
                  <input
                    type="date"
                    value={sprint.startDate ?? ""}
                    onChange={(e) => patchSprint(sprint.id, { startDate: e.target.value || undefined })}
                    className="px-1.5 py-0.5 rounded text-[11px] outline-none"
                    style={{ ...fieldStyle, colorScheme: "dark" }}
                    aria-label="Start date"
                  />
                  <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                    to
                  </span>
                  <input
                    type="date"
                    value={sprint.endDate ?? ""}
                    onChange={(e) => patchSprint(sprint.id, { endDate: e.target.value || undefined })}
                    className="px-1.5 py-0.5 rounded text-[11px] outline-none"
                    style={{ ...fieldStyle, colorScheme: "dark" }}
                    aria-label="End date"
                  />
                  <span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                    {list.length} issue{list.length === 1 ? "" : "s"}{stats.unit === "points" ? ` · ${stats.total} pts` : ""}
                  </span>
                  <div className="ml-auto flex items-center gap-1.5">
                    {sprint.state === "active" ? (
                      <button onClick={() => onCompleteSprint(sprint)} className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs" style={secondaryBtn}>
                        <ListChecks className="w-3.5 h-3.5" /> Complete sprint
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => startSprint(sprint)}
                          disabled={!!active}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold disabled:opacity-40"
                          style={{ background: "var(--accent)" }}
                          title={active ? "Complete the active sprint first" : "Start this sprint"}
                        >
                          <Play className="w-3 h-3" /> Start sprint
                        </button>
                        <button onClick={() => deleteSprint(sprint)} className="p-1 rounded-md" style={{ color: "var(--text-secondary)" }} aria-label={`Delete ${sprint.name}`} title="Delete sprint (its issues go back to the backlog)">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                  <input
                    defaultValue={sprint.goal ?? ""}
                    onBlur={(e) => e.target.value !== (sprint.goal ?? "") && patchSprint(sprint.id, { goal: e.target.value || undefined })}
                    placeholder="Sprint goal, e.g. First playable level"
                    className="basis-full bg-transparent text-xs outline-none rounded px-1 py-0.5 focus:bg-[var(--bg-primary)]"
                    style={{ color: "var(--text-secondary)" }}
                    aria-label="Sprint goal"
                  />
                </>
              ) : (
                <>
                  <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                    Backlog
                  </span>
                  <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                    {list.length} issue{list.length === 1 ? "" : "s"}
                  </span>
                </>
              )}
            </div>
            <ul>
              {list.length === 0 && (
                <li className="px-3 py-3 text-xs" style={{ color: "var(--text-muted)" }}>
                  {sprint ? "Drag issues here from the backlog." : "Nothing in the backlog."}
                </li>
              )}
              {list.map((issue) => {
                const col = board.columns.find((c) => c.id === issue.status);
                return (
                  <li
                    key={issue.id}
                    {...assetTriggerProps({ type: "issue", id: issue.id })}
                    draggable
                    onDragStart={(e) => {
                      dragId.current = issue.id;
                      e.dataTransfer.setData("text/plain", issue.id);
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const id = dragId.current ?? e.dataTransfer.getData("text/plain");
                      if (id && id !== issue.id) moveTo(id, sprint?.id ?? null, issue.id);
                      dragId.current = null;
                      setOver(null);
                    }}
                    className="group flex items-center gap-2 px-3 py-2 border-t first:border-t-0 hover:bg-[var(--bg-hover)] cursor-pointer"
                    style={{ borderColor: "var(--border)" }}
                    onClick={() => onOpen(issue.id)}
                  >
                    <TypeIcon type={issue.type} />
                    <span className="text-[11px] font-mono shrink-0" style={{ color: "var(--text-secondary)" }}>
                      {issue.key}
                    </span>
                    <span className="text-[13px] truncate flex-1 min-w-0" style={{ color: "var(--text-primary)" }}>
                      {issue.title}
                    </span>
                    {col && (
                      <span className="hidden sm:inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded shrink-0" style={{ background: "var(--bg-primary)", color: "var(--text-secondary)" }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: col.color }} />
                        {col.name}
                      </span>
                    )}
                    <PriorityIcon priority={issue.priority} />
                    {issue.points !== undefined && (
                      <span className="text-[11px] tabular-nums w-5 text-center" style={{ color: "var(--text-secondary)" }}>
                        {issue.points}
                      </span>
                    )}
                    <select
                      value={issue.sprintId ?? ""}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => moveTo(issue.id, e.target.value || null, null)}
                      className="px-1.5 py-0.5 rounded text-[11px] outline-none max-w-28"
                      style={fieldStyle}
                      aria-label={`Move ${issue.key} to sprint`}
                    >
                      <option value="">Backlog</option>
                      {[...(active ? [active] : []), ...planned].map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                    <AssetPinButton asset={{ type: "issue", id: issue.id }} label={`${issue.key} ${issue.title}`} />
                    <AssetMenuButton asset={{ type: "issue", id: issue.id }} label={`${issue.key} ${issue.title}`} />
                  </li>
                );
              })}
            </ul>
            <QuickAdd placeholder="New issue title" onAdd={(title) => createIssue(projectId, board, { title, sprintId: sprint?.id ?? null })} />
          </section>
        );
      })}

      {closed.length > 0 && (
        <details className="text-xs" style={{ color: "var(--text-muted)" }}>
          <summary className="cursor-pointer">Completed sprints ({closed.length})</summary>
          <ul className="mt-2 space-y-1">
            {closed.map((s) => {
              const n = issues.filter((i) => i.sprintId === s.id).length;
              return (
                <li key={s.id}>
                  {s.name}
                  {s.goal ? `: ${s.goal}` : ""} · closed {formatDate(s.closedAt)} · {n} issue{n === 1 ? "" : "s"} (find them in All issues)
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </div>
  );
}

// ─── all issues ──────────────────────────────────────────────────────────────

type SortKey = "key" | "title" | "type" | "priority" | "status" | "sprint" | "points" | "updated";

function AllIssuesView({
  projectId,
  board,
  issues,
  filters,
  onOpen,
}: {
  projectId: string;
  board: Board;
  issues: Issue[];
  filters: Filters;
  onOpen(id: string): void;
}) {
  const { assetTriggerProps } = useAssetMenu();
  const [status, setStatus] = useState("");
  const [includeArchived, setIncludeArchived] = useState(true);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "updated", dir: -1 });

  const colName = (id: string) => board.columns.find((c) => c.id === id)?.name ?? "—";
  const sprintName = (id: string | null) => (id ? board.sprints.find((s) => s.id === id)?.name ?? "—" : "Backlog");
  const colIndex = (id: string) => board.columns.findIndex((c) => c.id === id);

  const rows = issues
    .filter((i) => (includeArchived || !i.archived) && (!status || i.status === status) && matches(i, filters))
    .sort((a, b) => {
      const k = sort.key;
      const v =
        k === "key"
          ? a.key.localeCompare(b.key, undefined, { numeric: true })
          : k === "title"
            ? a.title.localeCompare(b.title)
            : k === "type"
              ? a.type.localeCompare(b.type)
              : k === "priority"
                ? PRIORITY_META[a.priority].rank - PRIORITY_META[b.priority].rank
                : k === "status"
                  ? colIndex(a.status) - colIndex(b.status)
                  : k === "sprint"
                    ? sprintName(a.sprintId).localeCompare(sprintName(b.sprintId))
                    : k === "points"
                      ? (a.points ?? -1) - (b.points ?? -1)
                      : a.updatedAt.localeCompare(b.updatedAt);
      return v * sort.dir;
    });

  const th = (k: SortKey, label: string, cls = "") => (
    <th className={`px-3 py-2 font-medium text-left whitespace-nowrap ${cls}`}>
      <button onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? ((-s.dir) as 1 | -1) : 1 }))} className="inline-flex items-center gap-1" style={{ color: sort.key === k ? "var(--text-primary)" : "var(--text-muted)" }}>
        {label}
        {sort.key === k && (sort.dir === 1 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
      </button>
    </th>
  );

  const archivedCount = issues.filter((i) => i.archived).length;

  return (
    <div className="p-3 md:p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="px-2 py-1 rounded-md outline-none" style={fieldStyle} aria-label="Filter by status">
          <option value="">Any status</option>
          {board.columns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <label className="inline-flex items-center gap-1.5" style={{ color: "var(--text-secondary)" }}>
          <input type="checkbox" checked={includeArchived} onChange={(e) => setIncludeArchived(e.target.checked)} />
          Include archived ({archivedCount})
        </label>
        <span className="ml-auto" style={{ color: "var(--text-muted)" }}>
          {rows.length} of {issues.length} issues
        </span>
      </div>
      <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid var(--border)", background: "var(--bg-secondary)" }}>
        <table className="w-full text-xs min-w-[720px]">
          <thead>
            <tr className="border-b" style={{ borderColor: "var(--border)" }}>
              {th("key", "Key")}
              {th("title", "Title", "w-full")}
              {th("type", "Type")}
              {th("priority", "Priority")}
              {th("status", "Status")}
              {th("sprint", "Sprint")}
              {th("points", "Pts")}
              {th("updated", "Updated")}
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center" style={{ color: "var(--text-muted)" }}>
                  No issues match.
                </td>
              </tr>
            )}
            {rows.map((i) => {
              const col = board.columns.find((c) => c.id === i.status);
              return (
                <tr
                  key={i.id}
                  {...assetTriggerProps({ type: "issue", id: i.id })}
                  onClick={() => onOpen(i.id)}
                  className="group border-t cursor-pointer hover:bg-[var(--bg-hover)]"
                  style={{ borderColor: "var(--border)", opacity: i.archived ? 0.6 : 1 }}
                >
                  <td className="px-3 py-2 font-mono whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
                    {i.key}
                    <span className="md:hidden inline-flex align-middle ml-1">
                      <AssetMenuButton asset={{ type: "issue", id: i.id }} label={`${i.key} ${i.title}`} />
                    </span>
                  </td>
                  <td className="px-3 py-2" style={{ color: "var(--text-primary)" }}>
                    <span className="inline-flex items-center gap-2">
                      {i.title}
                      {i.archived && (
                        <span className="text-[10px] uppercase tracking-wide px-1.5 py-px rounded" style={{ background: "var(--bg-hover)", color: "var(--text-muted)" }}>
                          Archived
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
                    <span className="inline-flex items-center gap-1.5">
                      <TypeIcon type={i.type} /> {TYPE_META[i.type]?.label}
                    </span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
                    <span className="inline-flex items-center gap-1.5">
                      <PriorityIcon priority={i.priority} /> {PRIORITY_META[i.priority]?.label}
                    </span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: col?.color ?? "var(--text-muted)" }} />
                      {colName(i.status)}
                    </span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
                    {sprintName(i.sprintId)}
                  </td>
                  <td className="px-3 py-2 tabular-nums" style={{ color: "var(--text-secondary)" }}>
                    {i.points ?? "–"}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                    {relativeTime(i.updatedAt)}
                  </td>
                  <td className="px-3 py-2">
                    {i.archived && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          saveIssue(projectId, board, i, { archived: false });
                        }}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md whitespace-nowrap"
                        style={secondaryBtn}
                        title="Put it back on the board"
                      >
                        <ArchiveRestore className="w-3 h-3" /> Restore
                      </button>
                    )}
                    <AssetPinButton asset={{ type: "issue", id: i.id }} label={`${i.key} ${i.title}`} className="ml-2 align-middle" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── dialogs & empty state ───────────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose(): void; children: React.ReactNode }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className="w-full max-w-md rounded-2xl p-5 shadow-2xl max-h-full overflow-y-auto" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
            {title}
          </h2>
          <button onClick={onClose} className="p-1 rounded-md" style={{ color: "var(--text-secondary)" }} aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function CreateIssueDialog({
  projectId,
  board,
  initial,
  onClose,
  onCreated,
}: {
  projectId: string;
  board: Board;
  initial: Partial<Issue>;
  onClose(): void;
  onCreated(id: string): void;
}) {
  const [title, setTitle] = useState(initial.title ?? "");
  const [type, setType] = useState<IssueType>(initial.type ?? "task");
  const [priority, setPriority] = useState<IssuePriority>(initial.priority ?? "medium");
  const [points, setPoints] = useState<string>(initial.points !== undefined ? String(initial.points) : "");
  const [sprintId, setSprintId] = useState<string>(initial.sprintId ?? "");
  const [status, setStatus] = useState(initial.status ?? board.columns[0]?.id ?? "todo");
  const sprints = board.sprints.filter((s) => s.state !== "closed");
  const sel = "w-full px-2 py-1.5 rounded-md text-xs outline-none";
  const lbl = "block text-[11px] space-y-1";

  return (
    <Modal title="Create issue" onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          const { issue } = createIssue(projectId, board, {
            title: title.trim(),
            type,
            priority,
            points: points === "" ? undefined : Math.max(0, Number(points)),
            sprintId: sprintId || null,
            status,
          });
          onCreated(issue.id);
        }}
      >
        <label className={lbl} style={{ color: "var(--text-muted)" }}>
          Title
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Add wall jump" className="w-full px-2.5 py-2 rounded-md text-sm outline-none" style={fieldStyle} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className={lbl} style={{ color: "var(--text-muted)" }}>
            Type
            <select value={type} onChange={(e) => setType(e.target.value as IssueType)} className={sel} style={fieldStyle}>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_META[t].label}
                </option>
              ))}
            </select>
          </label>
          <label className={lbl} style={{ color: "var(--text-muted)" }}>
            Priority
            <select value={priority} onChange={(e) => setPriority(e.target.value as IssuePriority)} className={sel} style={fieldStyle}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_META[p].label}
                </option>
              ))}
            </select>
          </label>
          <label className={lbl} style={{ color: "var(--text-muted)" }}>
            Column
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={sel} style={fieldStyle}>
              {board.columns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className={lbl} style={{ color: "var(--text-muted)" }}>
            Sprint
            <select value={sprintId} onChange={(e) => setSprintId(e.target.value)} className={sel} style={fieldStyle}>
              <option value="">Backlog</option>
              {sprints.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.state === "active" ? " (active)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className={lbl} style={{ color: "var(--text-muted)" }}>
            Story points
            <input type="number" min={0} value={points} onChange={(e) => setPoints(e.target.value)} placeholder="–" className={sel} style={fieldStyle} />
          </label>
        </div>
        <div className="flex items-center justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-md text-xs" style={secondaryBtn}>
            Cancel
          </button>
          <button type="submit" disabled={!title.trim()} className="px-3 py-1.5 rounded-md text-xs font-semibold disabled:opacity-40" style={{ background: "var(--accent)" }}>
            Create {board.keyPrefix}-issue
          </button>
        </div>
      </form>
    </Modal>
  );
}

function CompleteSprintDialog({
  projectId,
  board,
  sprint,
  issues,
  onClose,
}: {
  projectId: string;
  board: Board;
  sprint: Sprint;
  issues: Issue[];
  onClose(): void;
}) {
  const inSprint = issues.filter((i) => i.sprintId === sprint.id && !i.archived);
  const doneIds = new Set(board.columns.filter((c) => c.category === "done").map((c) => c.id));
  const done = inSprint.filter((i) => doneIds.has(i.status));
  const open = inSprint.filter((i) => !doneIds.has(i.status));
  const next = board.sprints.find((s) => s.state === "planned");
  const [target, setTarget] = useState<string>("");

  function complete() {
    const now = new Date().toISOString();
    for (const i of done) saveIssue(projectId, board, i, { archived: true });
    for (const i of open) saveIssue(projectId, board, i, { sprintId: target || null });
    saveBoard(projectId, board, { sprints: board.sprints.map((s) => (s.id === sprint.id ? { ...s, state: "closed", closedAt: now } : s)) });
    onClose();
  }

  return (
    <Modal title={`Complete ${sprint.name}`} onClose={onClose}>
      <div className="space-y-4 text-sm" style={{ color: "var(--text-secondary)" }}>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg p-3" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}>
            <p className="text-2xl font-semibold tabular-nums" style={{ color: "var(--green)" }}>
              {done.length}
            </p>
            <p className="text-xs">issues done</p>
          </div>
          <div className="rounded-lg p-3" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}>
            <p className="text-2xl font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
              {open.length}
            </p>
            <p className="text-xs">still open</p>
          </div>
        </div>
        <p className="text-xs">Done issues are archived: they leave the board but stay in All issues, where you can search, link and restore them.</p>
        {open.length > 0 && (
          <label className="block text-xs space-y-1">
            <span style={{ color: "var(--text-muted)" }}>Move open issues to</span>
            <select value={target} onChange={(e) => setTarget(e.target.value)} className="w-full px-2 py-1.5 rounded-md text-xs outline-none" style={fieldStyle}>
              <option value="">Backlog</option>
              {next && <option value={next.id}>{next.name} (next sprint)</option>}
            </select>
          </label>
        )}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 rounded-md text-xs" style={secondaryBtn}>
            Cancel
          </button>
          <button onClick={complete} className="px-3 py-1.5 rounded-md text-xs font-semibold" style={{ background: "var(--accent)" }}>
            Complete sprint
          </button>
        </div>
      </div>
    </Modal>
  );
}

function EmptyState({ projectId, onCreate }: { projectId: string; onCreate(): void }) {
  return (
    <div className="h-full flex items-center justify-center p-6">
      <div className="max-w-md text-center space-y-4">
        <div className="w-12 h-12 mx-auto rounded-xl flex items-center justify-center" style={{ background: "var(--accent-glow)" }}>
          <SquareKanban className="w-6 h-6" style={{ color: "var(--tool-color, var(--accent))" }} />
        </div>
        <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
          Plan your {APP.subject}, one issue at a time
        </h2>
        <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          Issues move from To Do to In Progress, Testing and Done. Group them into sprints of a week or two, and link each issue to
          the sprites, sounds and story it&rsquo;s about. Finished issues are archived but stay searchable.
        </p>
        <div className="flex items-center justify-center gap-2">
          <button onClick={onCreate} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-semibold" style={{ background: "var(--accent)" }}>
            <Plus className="w-4 h-4" /> Create issue
          </button>
        </div>
        <div className="flex justify-center">
          <ExamplesBar projectId={projectId} collections={["issues"]} />
        </div>
      </div>
    </div>
  );
}
