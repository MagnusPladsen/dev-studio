"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, ArrowLeft, NotebookPen, Plus, Trash2, X } from "lucide-react";
import { v4 as uuid } from "uuid";
import type { Board, Issue, IssuePriority, IssueType, Note } from "@/types";
import { storage } from "@/lib/storage";
import { addLink, getRelated } from "@/lib/links";
import { assetHref } from "@/lib/assets";
import { toggleTask } from "@/lib/task-list";
import { useAutosave, type SaveState } from "@/hooks/useAutosave";
import { useStorageVersion } from "@/hooks/useStorage";
import { LinkedAssets } from "@/components/LinkedAssets";
import { SaveIndicator } from "@/components/SaveIndicator";
import {
  CATEGORY_LABEL,
  MiniMarkdown,
  PRIORITIES,
  PRIORITY_META,
  PriorityIcon,
  TYPES,
  TYPE_META,
  TypeIcon,
  fieldStyle,
  formatDate,
  relativeTime,
  saveIssue,
  secondaryBtn,
} from "./meta";

interface Props {
  projectId: string;
  board: Board;
  issue: Issue;
  onClose(): void;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid grid-cols-[96px_1fr] items-center gap-2 text-xs">
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
      {children}
    </label>
  );
}

export function IssueDetail({ projectId, board, issue, onClose }: Props) {
  const router = useRouter();
  const version = useStorageVersion();
  const [draft, setDraft] = useState({ title: issue.title, description: issue.description });
  const [tab, setTab] = useState<"write" | "preview">(issue.description ? "preview" : "write");
  const [labelInput, setLabelInput] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const autosave = useAutosave(
    draft,
    (v) => {
      const cur = storage.getById("issues", issue.id, projectId);
      if (!cur || (cur.title === v.title && cur.description === v.description)) return;
      saveIssue(projectId, board, cur, { title: v.title.trim() || "Untitled issue", description: v.description });
    },
    { resetKey: issue.id, delay: 600 }
  );

  // follow outside changes (undo, another tab) while nothing is pending here
  const [seen, setSeen] = useState({ title: issue.title, description: issue.description });
  if (autosave.state === "saved" && (seen.title !== issue.title || seen.description !== issue.description)) {
    setSeen({ title: issue.title, description: issue.description });
    setDraft({ title: issue.title, description: issue.description });
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        autosave.flush();
      }
      if (e.key === "Escape") {
        const t = e.target as HTMLElement;
        if (t.closest("input, textarea, select")) (t as HTMLElement).blur();
        else onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [autosave, onClose]);

  const update = (patch: Partial<Issue>) => saveIssue(projectId, board, issue, patch);

  const notes = useMemo(
    () => getRelated(projectId, "issue", issue.id).filter((r) => r.type === "note"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectId, issue.id, version]
  );

  function addNote() {
    autosave.flush();
    const now = new Date().toISOString();
    const note: Note = {
      id: uuid(),
      projectId,
      title: `${issue.key}: ${issue.title}`,
      content: `Notes for issue ${issue.key}, "${issue.title}". The issue is linked below.\n\n`,
      folder: "Issues",
      tags: [issue.key.toLowerCase()],
      createdAt: now,
      updatedAt: now,
    };
    storage.save("notes", note, projectId);
    addLink(projectId, { type: "issue", id: issue.id }, { type: "note", id: note.id });
    router.push(assetHref(projectId, "note", note.id));
  }

  const sprints = board.sprints.filter((s) => s.state !== "closed" || s.id === issue.sprintId);
  const column = board.columns.find((c) => c.id === issue.status);

  return (
    <aside
      className="fixed inset-0 z-40 md:absolute md:inset-y-0 md:left-auto md:right-0 md:w-[460px] flex flex-col border-l shadow-2xl"
      style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}
      aria-label={`Issue ${issue.key}`}
    >
      <div className="h-12 shrink-0 flex items-center gap-2 px-3 border-b" style={{ borderColor: "var(--border)" }}>
        <button onClick={onClose} className="p-1.5 rounded-md md:hidden" style={{ color: "var(--text-primary)" }} aria-label="Back to the board">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <TypeIcon type={issue.type} />
        <span className="text-xs font-mono" style={{ color: "var(--text-secondary)" }}>
          {issue.key}
        </span>
        {issue.archived && (
          <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded" style={{ background: "var(--bg-hover)", color: "var(--text-muted)" }}>
            Archived
          </span>
        )}
        <SaveIndicator state={autosave.state as SaveState} className="ml-auto" />
        <button onClick={onClose} className="p-1.5 rounded-md hidden md:inline-flex" style={{ color: "var(--text-secondary)" }} aria-label="Close" title="Close (Esc)">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        <textarea
          value={draft.title}
          onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value.replace(/\n/g, " ") }))}
          rows={2}
          className="w-full bg-transparent text-lg font-semibold outline-none resize-none leading-snug"
          style={{ color: "var(--text-primary)" }}
          aria-label="Title"
        />

        <div className="space-y-2">
          <Field label="Status">
            <select value={issue.status} onChange={(e) => update({ status: e.target.value })} className="px-2 py-1.5 rounded-md text-xs outline-none" style={fieldStyle}>
              {board.columns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({CATEGORY_LABEL[c.category]})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Type">
            <div className="flex items-center gap-2">
              <TypeIcon type={issue.type} />
              <select value={issue.type} onChange={(e) => update({ type: e.target.value as IssueType })} className="flex-1 px-2 py-1.5 rounded-md text-xs outline-none" style={fieldStyle}>
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_META[t].label}
                  </option>
                ))}
              </select>
            </div>
          </Field>
          <Field label="Priority">
            <div className="flex items-center gap-2">
              <PriorityIcon priority={issue.priority} />
              <select value={issue.priority} onChange={(e) => update({ priority: e.target.value as IssuePriority })} className="flex-1 px-2 py-1.5 rounded-md text-xs outline-none" style={fieldStyle}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_META[p].label}
                  </option>
                ))}
              </select>
            </div>
          </Field>
          <Field label="Sprint">
            <select
              value={issue.sprintId ?? ""}
              onChange={(e) => update({ sprintId: e.target.value || null })}
              className="px-2 py-1.5 rounded-md text-xs outline-none"
              style={fieldStyle}
            >
              <option value="">Backlog</option>
              {sprints.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.state === "active" ? " (active)" : s.state === "closed" ? " (closed)" : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Story points">
            <input
              type="number"
              min={0}
              max={100}
              value={issue.points ?? ""}
              onChange={(e) => update({ points: e.target.value === "" ? undefined : Math.max(0, Number(e.target.value)) })}
              placeholder="–"
              className="w-24 px-2 py-1.5 rounded-md text-xs outline-none"
              style={fieldStyle}
            />
          </Field>
          <Field label="Due date">
            <input
              type="date"
              value={issue.dueDate ?? ""}
              onChange={(e) => update({ dueDate: e.target.value || undefined })}
              className="w-40 px-2 py-1.5 rounded-md text-xs outline-none"
              style={{ ...fieldStyle, colorScheme: "dark" }}
            />
          </Field>
          <Field label="Labels">
            <div className="flex items-center gap-1 flex-wrap">
              {issue.labels.map((l) => (
                <span key={l} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px]" style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}>
                  {l}
                  <button onClick={() => update({ labels: issue.labels.filter((x) => x !== l) })} aria-label={`Remove label ${l}`} style={{ color: "var(--text-muted)" }}>
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              <input
                value={labelInput}
                onChange={(e) => setLabelInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    const l = labelInput.trim().toLowerCase().replace(/\s+/g, "-");
                    if (l && !issue.labels.includes(l)) update({ labels: [...issue.labels, l] });
                    setLabelInput("");
                  }
                }}
                placeholder="Add label…"
                className="w-24 bg-transparent text-[11px] outline-none px-1 py-0.5"
                style={{ color: "var(--text-primary)" }}
                aria-label="Add label"
              />
            </div>
          </Field>
        </div>

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
              Description
            </h3>
            <div className="flex rounded-md overflow-hidden text-[11px]" style={{ border: "1px solid var(--border)" }}>
              {(["write", "preview"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className="px-2 py-0.5"
                  style={{ background: tab === t ? "var(--bg-hover)" : "transparent", color: tab === t ? "var(--text-primary)" : "var(--text-secondary)" }}
                >
                  {t === "write" ? "Write" : "Preview"}
                </button>
              ))}
            </div>
          </div>
          {tab === "write" ? (
            <textarea
              value={draft.description}
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              rows={8}
              placeholder="What needs to happen? Markdown works: **bold**, - lists, `code`."
              className="w-full px-3 py-2 rounded-md text-sm outline-none font-mono leading-relaxed"
              style={fieldStyle}
              aria-label="Description"
            />
          ) : (
            <div
              className="min-h-16 px-3 py-2 rounded-md cursor-text"
              style={{ border: "1px solid var(--border)" }}
              onClick={() => setTab("write")}
              title="Click to edit"
            >
              {draft.description.trim() ? (
                <MiniMarkdown text={draft.description} onToggleTask={(line) => setDraft((d) => ({ ...d, description: toggleTask(d.description, line) }))} />
              ) : ( <p className="text-sm" style={{ color: "var(--text-muted)" }}>No description yet. Click to write one.</p>
              )}
            </div>
          )}
        </section>

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
              Notes
            </h3>
            <button onClick={addNote} className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs" style={secondaryBtn} title="Create a note in the Notebook, linked to this issue">
              <Plus className="w-3 h-3" /> Add note
            </button>
          </div>
          {notes.length === 0 ? (
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Notes you add here are saved in the Notebook (folder &ldquo;Issues&rdquo;) and stay linked to this issue.
            </p>
          ) : (
            <ul className="space-y-1">
              {notes.map((n) => (
                <li key={n.id}>
                  <Link
                    href={assetHref(projectId, "note", n.id)}
                    className="flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-[var(--bg-hover)]"
                    style={{ border: "1px solid var(--border)" }}
                  >
                    <NotebookPen className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: "#a3e635" }} />
                    <span className="min-w-0">
                      <span className="block text-xs truncate" style={{ color: "var(--text-primary)" }}>
                        {n.name}
                      </span>
                      {n.excerpt && (
                        <span className="block text-[11px] truncate" style={{ color: "var(--text-muted)" }}>
                          {n.excerpt}
                        </span>
                      )}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-2">
          <LinkedAssets projectId={projectId} type="issue" id={issue.id} layout="panel" />
        </section>

        <div className="text-[11px] space-y-0.5" style={{ color: "var(--text-muted)" }}>
          <p>
            Created {formatDate(issue.createdAt)} · Updated {relativeTime(issue.updatedAt)}
          </p>
          {issue.resolvedAt && <p>Done {formatDate(issue.resolvedAt)}{column ? ` in ${column.name}` : ""}</p>}
        </div>
      </div>

      <div className="shrink-0 flex items-center gap-2 p-3 border-t flex-wrap" style={{ borderColor: "var(--border)" }}>
        {issue.archived ? (
          <button onClick={() => update({ archived: false })} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs" style={secondaryBtn}>
            <ArchiveRestore className="w-3.5 h-3.5" /> Restore to board
          </button>
        ) : (
          <button
            onClick={() => update({ archived: true })}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs"
            style={secondaryBtn}
            title="Take it off the board. It stays searchable in All issues and can still be linked."
          >
            <Archive className="w-3.5 h-3.5" /> Archive
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          {confirmDelete ? (
            <>
              <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                Delete {issue.key} for good?
              </span>
              <button
                onClick={() => {
                  storage.delete("issues", issue.id, projectId);
                  onClose();
                }}
                className="px-2.5 py-1.5 rounded-md text-xs"
                style={{ background: "var(--red)", color: "#fff" }}
              >
                Delete
              </button>
              <button onClick={() => setConfirmDelete(false)} className="px-2.5 py-1.5 rounded-md text-xs" style={secondaryBtn}>
                Cancel
              </button>
            </>
          ) : (
            <button onClick={() => setConfirmDelete(true)} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs" style={{ color: "var(--red)", border: "1px solid var(--border)" }}>
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
