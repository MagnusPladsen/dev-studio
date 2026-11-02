"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  NotebookPen,
  Plus,
  Search,
  Pin,
  PinOff,
  Trash2,
  Folder,
  Tag,
  X,
  Columns2,
  PenLine,
  Eye,
  ListChecks,
  ChevronLeft,
  Check,
  ChevronDown,
} from "lucide-react";
import { v4 as uuid } from "uuid";
import { storage } from "@/lib/storage";
import { assetHref } from "@/lib/assets";
import { registerAutosaveFlush } from "@/lib/autosave-registry";
import { useOpenParam, useTrackOpenAsset, useStorageVersion } from "@/hooks/useStorage";
import { useHistory } from "@/hooks/useHistory";
import { LinkedAssets } from "@/components/LinkedAssets";
import { UndoRedoButtons } from "@/components/UndoRedoButtons";
import type { Note } from "@/types";
import { SaveIndicator } from "@/components/SaveIndicator";
import { ExamplesBar } from "@/components/ExamplesBar";
import { HelpButton } from "@/components/HelpButton";
import { useAssetMenu, type MenuTriggerProps } from "@/components/AssetContextMenu";
import { AssetMenuButton, AssetPinButton, PasteButton } from "@/components/AssetMenuButton";

const ACCENT = "#a3e635";
const SAVE_DELAY = 600;

// ─── templates ───────────────────────────────────────────────────────

const TEMPLATES: { key: string; label: string; title: string; content: string }[] = [
  { key: "blank", label: "Blank", title: "Untitled note", content: "" },
  {
    key: "todo",
    label: "To-do list",
    title: "To-do",
    content: "- [ ] First task\n- [ ] Second task\n- [ ] Third task\n",
  },
  {
    key: "gdd",
    label: "Game design doc",
    title: "Game design doc",
    content:
      "## Pitch\nOne or two sentences: what is the game and why is it fun?\n\n## Core loop\nWhat does the player do again and again?\n\n## Controls\n- Move:\n- Action:\n\n## Art style\n\n## Audio\n\n## Scope\n- [ ] Must have:\n- [ ] Nice to have:\n",
  },
  {
    key: "bugs",
    label: "Bug list",
    title: "Bug list",
    content:
      "## Open\n- [ ] What happens, and the steps to make it happen\n\n## Fixed\n- [x] Example: player could jump through ceilings\n",
  },
  {
    key: "playtest",
    label: "Playtest notes",
    title: "Playtest notes",
    content:
      "**Date:** \n**Tester:** \n**Build:** \n\n## What worked\n- \n\n## What was confusing\n- \n\n## Ideas to try\n- [ ] \n",
  },
];

// ─── helpers ─────────────────────────────────────────────────────────

const CHECK_LINE = /^(\s*[-*+] \[)( |x|X)(\])/;

function checklistProgress(content: string): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const line of content.split("\n")) {
    const m = line.match(CHECK_LINE);
    if (!m) continue;
    total++;
    if (m[2] !== " ") done++;
  }
  return { done, total };
}

function excerpt(content: string): string {
  for (const raw of content.split("\n")) {
    const line = raw
      .replace(/^\s*#+\s*/, "")
      .replace(/^\s*[-*+]\s+(\[[ xX]\]\s*)?/, "")
      .replace(/^\s*\d+\.\s+/, "")
      .replace(/^>\s*/, "")
      .replace(/[*_`]/g, "")
      .replace(/\[\[([^\]|]+)(\|([^\]]+))?\]\]/g, (_, t, __, a) => a || t)
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .trim();
    if (line) return line;
  }
  return "Empty note";
}

function relativeTime(iso: string): string {
  const t = Date.parse(iso);
  if (!t) return "";
  const diff = Date.now() - t;
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(t).toLocaleDateString();
}

function toggleChecklistLine(content: string, lineIndex: number): string {
  const lines = content.split("\n");
  const line = lines[lineIndex];
  if (line === undefined) return content;
  lines[lineIndex] = line.replace(CHECK_LINE, (_, a, mark, b) => `${a}${mark === " " ? "x" : " "}${b}`);
  return lines.join("\n");
}

function isSafeUrl(url: string): boolean {
  return /^(https?:|mailto:|\/|#)/i.test(url);
}

/** Pixel position of a caret inside a textarea, relative to the textarea's top-left. */
function caretCoords(ta: HTMLTextAreaElement, pos: number): { top: number; left: number; lineHeight: number } {
  const cs = getComputedStyle(ta);
  const div = document.createElement("div");
  const props = [
    "box-sizing", "width", "padding-top", "padding-right", "padding-bottom", "padding-left",
    "border-top-width", "border-right-width", "border-bottom-width", "border-left-width",
    "font-family", "font-size", "font-weight", "line-height", "letter-spacing", "tab-size",
  ];
  for (const p of props) div.style.setProperty(p, cs.getPropertyValue(p));
  div.style.position = "absolute";
  div.style.visibility = "hidden";
  div.style.whiteSpace = "pre-wrap";
  div.style.overflowWrap = "break-word";
  div.style.top = "0";
  div.style.left = "-9999px";
  div.textContent = ta.value.slice(0, pos);
  const span = document.createElement("span");
  span.textContent = ta.value.slice(pos) || ".";
  div.appendChild(span);
  document.body.appendChild(div);
  const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.5 || 20;
  const result = { top: span.offsetTop - ta.scrollTop, left: span.offsetLeft - ta.scrollLeft, lineHeight: lh };
  document.body.removeChild(div);
  return result;
}

// ─── markdown preview ────────────────────────────────────────────────

type WikiTarget = { type: "note" | "story"; id: string; title: string };

interface RenderCtx {
  resolve(title: string): WikiTarget | undefined;
  triggerProps(target: WikiTarget): MenuTriggerProps;
  onWiki(title: string, target: WikiTarget | undefined): void;
  onToggle(lineIndex: number): void;
}

const INLINE =
  /(`[^`\n]+`)|(\[\[[^\]\n]+\]\])|(\[[^\]\n]+\]\([^)\s]+\))|(\*\*[^*\n]+\*\*|__[^_\n]+__)|(\*[^*\s][^*\n]*\*|_[^_\s][^_\n]*_)/g;

function renderInline(text: string, ctx: RenderCtx, keyBase: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(INLINE)) {
    const start = m.index ?? 0;
    if (start > last) out.push(text.slice(last, start));
    const tok = m[0];
    const key = `${keyBase}-${i++}`;
    if (m[1]) {
      out.push(
        <code key={key} className="px-1 py-0.5 rounded text-[0.85em] font-mono" style={{ background: "var(--bg-hover)", color: "var(--text-primary)" }}>
          {tok.slice(1, -1)}
        </code>
      );
    } else if (m[2]) {
      const inner = tok.slice(2, -2);
      const [titleRaw, alias] = inner.split("|");
      const title = titleRaw.trim();
      const target = ctx.resolve(title);
      out.push(
        <button
          key={key}
          {...(target ? ctx.triggerProps(target) : {})}
          onClick={() => ctx.onWiki(title, target)}
          className="inline px-1 rounded hover:underline"
          style={
            target
              ? { color: target.type === "note" ? ACCENT : "#fb923c", background: target.type === "note" ? "rgba(163,230,53,0.1)" : "rgba(251,146,60,0.1)" }
              : { color: "var(--red)", border: "1px dashed rgba(248,113,113,0.5)" }
          }
          title={target ? `Open ${target.type === "note" ? "note" : "story entry"} “${target.title}”` : `No note called “${title}” yet. Click to create it.`}
        >
          {(alias ?? titleRaw).trim()}
        </button>
      );
    } else if (m[3]) {
      const lm = tok.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
      const label = lm?.[1] ?? tok;
      const url = lm?.[2] ?? "";
      out.push(
        isSafeUrl(url) ? (
          <a key={key} href={url} target={url.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer" className="underline" style={{ color: "var(--blue)" }}>
            {label}
          </a>
        ) : (
          <span key={key}>{label}</span>
        )
      );
    } else if (m[4]) {
      out.push(
        <strong key={key} style={{ color: "var(--text-primary)" }}>
          {renderInline(tok.slice(2, -2), ctx, key)}
        </strong>
      );
    } else if (m[5]) {
      out.push(<em key={key}>{renderInline(tok.slice(1, -1), ctx, key)}</em>);
    }
    last = start + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function MarkdownPreview({ content, ctx }: { content: string; ctx: RenderCtx }) {
  const lines = content.split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let k = 0;

  while (i < lines.length) {
    const line = lines[i];
    const key = `b${k++}`;

    if (/^\s*```/.test(line)) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i++]);
      i++;
      blocks.push(
        <pre key={key} className="text-xs font-mono p-3 rounded-lg overflow-x-auto my-2" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
          {code.join("\n")}
        </pre>
      );
      continue;
    }

    if (!line.trim()) {
      i++;
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      const size = level === 1 ? "text-xl" : level === 2 ? "text-lg" : "text-base";
      blocks.push(
        <div key={key} className={`${size} font-semibold mt-4 mb-1.5`} style={{ color: "var(--text-primary)" }}>
          {renderInline(heading[2], ctx, key)}
        </div>
      );
      i++;
      continue;
    }

    if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) {
      blocks.push(<hr key={key} className="my-3" style={{ borderColor: "var(--border)" }} />);
      i++;
      continue;
    }

    if (/^\s*>/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) quote.push(lines[i++].replace(/^\s*>\s?/, ""));
      blocks.push(
        <blockquote key={key} className="pl-3 my-2 italic" style={{ borderLeft: `3px solid ${ACCENT}55`, color: "var(--text-secondary)" }}>
          {renderInline(quote.join(" "), ctx, key)}
        </blockquote>
      );
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        const li = lines[i];
        const lineIndex = i;
        const check = li.match(/^\s*[-*+] \[( |x|X)\]\s?(.*)$/);
        if (check) {
          const done = check[1] !== " ";
          items.push(
            <li key={`${key}-${i}`} className="flex items-start gap-2 py-0.5 list-none -ml-5">
              <button
                onClick={() => ctx.onToggle(lineIndex)}
                className="mt-[3px] w-4 h-4 rounded shrink-0 flex items-center justify-center transition-colors"
                style={{ background: done ? ACCENT : "transparent", border: `1.5px solid ${done ? ACCENT : "var(--border-hover)"}` }}
                aria-label={done ? "Mark as not done" : "Mark as done"}
              >
                {done && <Check className="w-3 h-3" style={{ color: "#1a2e05" }} strokeWidth={3} />}
              </button>
              <span
                onClick={(e) => {
                  if (!(e.target as HTMLElement).closest("a,button")) ctx.onToggle(lineIndex);
                }}
                className="cursor-pointer select-none"
                style={{ color: done ? "var(--text-muted)" : "var(--text-secondary)", textDecoration: done ? "line-through" : undefined }}
              >
                {renderInline(check[2], ctx, `${key}-${i}`)}
              </span>
            </li>
          );
        } else {
          items.push(
            <li key={`${key}-${i}`} className="py-0.5">
              {renderInline(li.replace(/^\s*[-*+]\s+/, ""), ctx, `${key}-${i}`)}
            </li>
          );
        }
        i++;
      }
      blocks.push(
        <ul key={key} className="list-disc pl-5 my-1.5" style={{ color: "var(--text-secondary)" }}>
          {items}
        </ul>
      );
      continue;
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(
          <li key={`${key}-${i}`} className="py-0.5">
            {renderInline(lines[i].replace(/^\s*\d+[.)]\s+/, ""), ctx, `${key}-${i}`)}
          </li>
        );
        i++;
      }
      blocks.push(
        <ol key={key} className="list-decimal pl-5 my-1.5" style={{ color: "var(--text-secondary)" }}>
          {items}
        </ol>
      );
      continue;
    }

    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,4}\s|\s*```|\s*>|\s*[-*+]\s+|\s*\d+[.)]\s+|\s*(---|\*\*\*|___)\s*$)/.test(lines[i])
    ) {
      para.push(lines[i++]);
    }
    // never stall on a line no block rule claimed
    if (!para.length) para.push(lines[i++]);
    blocks.push(
      <p key={key} className="my-1.5 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
        {para.map((p, j) => (
          <span key={j}>
            {j > 0 && <br />}
            {renderInline(p, ctx, `${key}-${j}`)}
          </span>
        ))}
      </p>
    );
  }

  if (!blocks.length) {
    return (
      <p className="text-sm italic" style={{ color: "var(--text-muted)" }}>
        Nothing written yet.
      </p>
    );
  }
  return <div className="text-sm">{blocks}</div>;
}

// ─── page ────────────────────────────────────────────────────────────

type ViewMode = "split" | "edit" | "preview";

export default function NotebookPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;
  const { assetTriggerProps, pasteTriggerProps } = useAssetMenu();
  const version = useStorageVersion();

  const [draft, setDraft] = useState<Note | null>(null);
  const [query, setQuery] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [templateMenu, setTemplateMenu] = useState(false);
  // narrow screens start in single-column edit mode (this page only renders on the client)
  const [viewMode, setViewMode] = useState<ViewMode>(() =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches ? "edit" : "split"
  );
  const [tagInput, setTagInput] = useState("");
  const [complete, setComplete] = useState<{ query: string; start: number; top: number; left: number; index: number } | null>(null);

  const savedRef = useRef<Note | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedFlashRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const draftRef = useRef<Note | null>(null);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stored = useMemo(() => storage.getAll("notes", projectId), [projectId, version]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stories = useMemo(() => storage.getAll("stories", projectId), [projectId, version]);

  // the open note shows its live draft in the list
  const notes = useMemo(() => (draft ? stored.map((n) => (n.id === draft.id ? draft : n)) : stored), [stored, draft]);

  // ── saving ──
  const writeNow = useCallback(
    (note: Note) => {
      storage.save("notes", { ...note, updatedAt: new Date().toISOString() }, projectId);
      savedRef.current = note;
      setSaveState("saved");
      if (savedFlashRef.current) clearTimeout(savedFlashRef.current);
      savedFlashRef.current = setTimeout(() => setSaveState("idle"), 1500);
    },
    [projectId]
  );

  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
      const d = draftRef.current;
      if (d && d !== savedRef.current && storage.getById("notes", d.id, projectId)) writeNow(d);
    }
  }, [projectId, writeNow]);

  useEffect(() => {
    if (!draft || draft === savedRef.current) return;
    setSaveState("saving");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      // skip if the note was deleted meanwhile
      if (storage.getById("notes", draft.id, projectId)) writeNow(draft);
    }, SAVE_DELAY);
  }, [draft, projectId, writeNow]);

  useEffect(() => registerAutosaveFlush(flush), [flush]);

  // save pending changes when leaving the page
  useEffect(() => () => flush(), [flush]);

  // Ctrl/⌘+S saves straight away
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        flush();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flush]);

  // ── history (undo/redo) ──
  const history = useHistory<Note | null>(draft, (v) => setDraft(v), draft?.id);

  // ── selection ──
  const select = useCallback(
    (id: string | null) => {
      flush();
      const note = id ? storage.getById("notes", id, projectId) ?? null : null;
      savedRef.current = note;
      setDraft(note);
      setComplete(null);
      setTagInput("");
    },
    [flush, projectId]
  );

  useOpenParam((id) => select(id));
  useTrackOpenAsset(draft?.id ? { type: "note", id: draft?.id } : null);

  function onListClick(e: React.MouseEvent<HTMLButtonElement>) {
    const id = e.currentTarget.dataset.noteId;
    if (id) select(id);
  }

  // the open note was deleted elsewhere (e.g. another tab or sign-out)
  useEffect(() => {
    if (draft && !storage.getById("notes", draft.id, projectId) && !timerRef.current && draft === savedRef.current) {
      setDraft(null);
    }
  }, [version, draft, projectId]);

  function update(patch: Partial<Note>) {
    setDraft((d) => (d ? { ...d, ...patch } : d));
  }

  function createNote(templateKey: string, titleOverride?: string) {
    flush();
    const t = TEMPLATES.find((x) => x.key === templateKey) ?? TEMPLATES[0];
    const now = new Date().toISOString();
    const note: Note = {
      id: uuid(),
      projectId,
      title: titleOverride ?? t.title,
      content: t.content,
      folder: draft?.folder ?? "",
      pinned: false,
      tags: [],
      createdAt: now,
      updatedAt: now,
    };
    storage.save("notes", note, projectId);
    savedRef.current = note;
    setDraft(note);
    setTemplateMenu(false);
    setComplete(null);
    if (viewMode === "preview") setViewMode(window.matchMedia("(max-width: 1023px)").matches ? "edit" : "split");
  }

  function deleteNote() {
    if (!draft) return;
    if (!confirm(`Delete “${draft.title || "Untitled note"}”? This cannot be undone.`)) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    storage.delete("notes", draft.id, projectId);
    savedRef.current = null;
    setDraft(null);
    setSaveState("idle");
  }

  // ── wiki links ──
  const titleIndex = useMemo(() => {
    const map = new Map<string, WikiTarget>();
    for (const s of stories) map.set(s.title.trim().toLowerCase(), { type: "story", id: s.id, title: s.title });
    for (const n of notes) map.set(n.title.trim().toLowerCase(), { type: "note", id: n.id, title: n.title });
    return map;
  }, [notes, stories]);

  const renderCtx: RenderCtx = {
    resolve: (title) => titleIndex.get(title.toLowerCase()),
    triggerProps: (target) => assetTriggerProps({ type: target.type, id: target.id }),
    onWiki: (title, target) => {
      if (!target) createNote("blank", title);
      else if (target.type === "note") select(target.id);
      else {
        flush();
        router.push(assetHref(projectId, "story", target.id));
      }
    },
    onToggle: (lineIndex) => {
      if (draft) update({ content: toggleChecklistLine(draft.content, lineIndex) });
    },
  };

  // ── [[ autocomplete ──
  const suggestions = useMemo(() => {
    if (!complete) return [];
    const q = complete.query.trim().toLowerCase();
    return [...titleIndex.values()]
      .filter((t) => !(t.type === "note" && t.id === draft?.id) && (!q || t.title.toLowerCase().includes(q)))
      .sort((a, b) => {
        const as = a.title.toLowerCase().startsWith(q) ? 0 : 1;
        const bs = b.title.toLowerCase().startsWith(q) ? 0 : 1;
        return as - bs || a.title.localeCompare(b.title);
      })
      .slice(0, 8);
  }, [complete, titleIndex, draft?.id]);

  function checkAutocomplete(ta: HTMLTextAreaElement) {
    const pos = ta.selectionStart;
    const before = ta.value.slice(0, pos);
    const m = before.match(/\[\[([^[\]\n|]*)$/);
    if (!m) {
      setComplete(null);
      return;
    }
    const c = caretCoords(ta, pos);
    setComplete((prev) => ({
      query: m[1],
      start: pos - m[1].length,
      top: c.top + c.lineHeight + 4,
      left: Math.max(0, Math.min(c.left, ta.clientWidth - 260)),
      index: prev && prev.query === m[1] ? prev.index : 0,
    }));
  }

  function insertSuggestion(title: string) {
    const ta = textareaRef.current;
    if (!ta || !complete || !draft) return;
    const pos = ta.selectionStart;
    const value = ta.value;
    const after = value.slice(pos).startsWith("]]") ? value.slice(pos + 2) : value.slice(pos);
    const next = value.slice(0, complete.start) + `${title}]]` + after;
    const caret = complete.start + title.length + 2;
    update({ content: next });
    setComplete(null);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(caret, caret);
    });
  }

  function onEditorKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!complete || suggestions.length === 0) {
      if (e.key === "Escape") setComplete(null);
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const d = e.key === "ArrowDown" ? 1 : -1;
      setComplete((c) => (c ? { ...c, index: (c.index + d + suggestions.length) % suggestions.length } : c));
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      insertSuggestion(suggestions[Math.min(complete.index, suggestions.length - 1)].title);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setComplete(null);
    }
  }

  // ── tags ──
  function addTag() {
    const t = tagInput.trim().replace(/^#/, "");
    if (!draft || !t || draft.tags.includes(t)) {
      setTagInput("");
      return;
    }
    update({ tags: [...draft.tags, t] });
    setTagInput("");
  }

  // ── list grouping ──
  const folders = useMemo(
    () => [...new Set(notes.map((n) => (n.folder ?? "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [notes]
  );

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = notes
      .filter(
        (n) =>
          !q ||
          n.title.toLowerCase().includes(q) ||
          n.content.toLowerCase().includes(q) ||
          (n.folder ?? "").toLowerCase().includes(q) ||
          n.tags.some((t) => t.toLowerCase().includes(q))
      )
      .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
    const out: { label: string; pinned?: boolean; items: Note[] }[] = [];
    const pinned = filtered.filter((n) => n.pinned);
    if (pinned.length) out.push({ label: "Pinned", pinned: true, items: pinned });
    const rest = filtered.filter((n) => !n.pinned);
    for (const f of folders) {
      const items = rest.filter((n) => (n.folder ?? "").trim() === f);
      if (items.length) out.push({ label: f, items });
    }
    const loose = rest.filter((n) => !(n.folder ?? "").trim());
    if (loose.length) out.push({ label: folders.length ? "No folder" : "Notes", items: loose });
    return out;
  }, [notes, folders, query]);

  const progress = draft ? checklistProgress(draft.content) : { done: 0, total: 0 };
  const inputStyle = { background: "var(--bg-primary)", color: "var(--text-primary)", border: "1px solid var(--border)" };

  // ── render ──
  return (
    <div className="flex h-full overflow-hidden" style={{ background: "var(--bg-primary)" }}>
      {/* Note list */}
      <aside
        className={`${draft ? "hidden md:flex" : "flex"} w-full md:w-72 shrink-0 flex-col border-r`}
        style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}
      >
        <div className="p-3 border-b space-y-2" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center gap-2">
            <NotebookPen className="w-4 h-4" style={{ color: ACCENT }} />
            <span className="text-sm font-semibold flex-1" style={{ color: "var(--text-primary)" }}>
              Notebook
            </span>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              {notes.length}
            </span>
            <HelpButton topic="notebook" />
          </div>
          <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg" style={inputStyle}>
            <Search className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--text-muted)" }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search notes"
              className="flex-1 min-w-0 bg-transparent text-xs outline-none"
              style={{ color: "var(--text-primary)" }}
            />
            {query && (
              <button onClick={() => setQuery("")} style={{ color: "var(--text-muted)" }} aria-label="Clear search">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          <div className="flex gap-1.5">
            <div className="relative flex-1">
              <div className="flex">
                <button
                  onClick={() => createNote("blank")}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-l-lg text-xs font-medium"
                  style={{ background: ACCENT, color: "#1a2e05" }}
                >
                  <Plus className="w-3.5 h-3.5" />
                  New note
                </button>
                <button
                  onClick={() => setTemplateMenu((v) => !v)}
                  className="px-2 rounded-r-lg"
                  style={{ background: ACCENT, color: "#1a2e05", borderLeft: "1px solid rgba(26,46,5,0.25)" }}
                  title="Start from a template"
                  aria-label="Templates"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>
              {templateMenu && (
                <div className="absolute z-30 top-full left-0 right-0 mt-1 p-1 rounded-lg shadow-xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                  <div className="text-[10px] uppercase tracking-wide px-2 py-1" style={{ color: "var(--text-muted)" }}>
                    Start from
                  </div>
                  {TEMPLATES.map((t) => (
                    <button
                      key={t.key}
                      onClick={() => createNote(t.key)}
                      className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-[var(--bg-hover)]"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <PasteButton type="note" />
          </div>
        </div>

        <div {...pasteTriggerProps("note")} className="flex-1 overflow-y-auto p-2">
          {notes.length === 0 ? (
            <p className="text-xs text-center px-4 py-8" style={{ color: "var(--text-muted)" }}>
              No notes yet.
            </p>
          ) : groups.length === 0 ? (
            <p className="text-xs text-center px-4 py-8" style={{ color: "var(--text-muted)" }}>
              No notes match “{query}”.
            </p>
          ) : (
            groups.map((g) => (
              <div key={g.label} className="mb-2">
                <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                  {g.pinned ? <Pin className="w-3 h-3" /> : <Folder className="w-3 h-3" />}
                  <span className="truncate">{g.label}</span>
                  <span className="ml-auto">{g.items.length}</span>
                </div>
                {g.items.map((n) => {
                  const p = checklistProgress(n.content);
                  const active = draft?.id === n.id;
                  return (
                    <div key={n.id} className="group relative">
                      <button
                        {...assetTriggerProps({ type: "note", id: n.id })}
                        data-note-id={n.id}
                        onClick={onListClick}
                        className="w-full text-left px-2.5 max-md:pr-9 md:pr-7 py-2 rounded-lg mb-0.5 transition-colors hover:bg-[var(--bg-hover)]"
                        style={{ background: active ? "var(--bg-hover)" : undefined, boxShadow: active ? `inset 2px 0 0 ${ACCENT}` : undefined }}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm truncate flex-1" style={{ color: "var(--text-primary)" }}>
                            {n.title || "Untitled note"}
                          </span>
                          {p.total > 0 && (
                            <span
                              className="text-[10px] px-1.5 rounded-full shrink-0 tabular-nums"
                              style={{
                                background: p.done === p.total ? "rgba(163,230,53,0.15)" : "var(--bg-card)",
                                color: p.done === p.total ? ACCENT : "var(--text-secondary)",
                              }}
                            >
                              {p.done}/{p.total}
                            </span>
                          )}
                        </div>
                        <div className="text-xs truncate mt-0.5" style={{ color: "var(--text-muted)" }}>
                          {excerpt(n.content)}
                        </div>
                        <div className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                          {relativeTime(n.updatedAt)}
                        </div>
                      </button>
                      <div className="md:hidden absolute right-1 top-1/2 -translate-y-1/2">
                        <AssetMenuButton asset={{ type: "note", id: n.id }} label={n.title || "Untitled note"} />
                      </div>
                      <div className="max-md:hidden absolute right-2 top-1/2 -translate-y-1/2 flex">
                        <AssetPinButton asset={{ type: "note", id: n.id }} label={n.title || "Untitled note"} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
        <div className="px-3 py-2.5 border-t" style={{ borderColor: "var(--border)" }}>
          <ExamplesBar projectId={projectId} collections={["notes"]} />
        </div>
      </aside>

      {/* Editor */}
      <section className={`${draft ? "flex" : "hidden md:flex"} flex-1 min-w-0 flex-col`}>
        {!draft ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: "rgba(163,230,53,0.12)", color: ACCENT }}>
              <NotebookPen className="w-7 h-7" />
            </div>
            <p className="font-medium mb-1" style={{ color: "var(--text-primary)" }}>
              {notes.length ? "Pick a note, or start a new one" : "Your notebook is empty"}
            </p>
            <p className="text-sm max-w-sm mb-5" style={{ color: "var(--text-secondary)" }}>
              Keep ideas, to-do lists, design notes and playtest feedback here. Link notes to sprites, sounds and story
              entries.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {TEMPLATES.map((t) => (
                <button
                  key={t.key}
                  onClick={() => createNote(t.key)}
                  className="text-xs px-3 py-1.5 rounded-lg"
                  style={t.key === "blank" ? { background: ACCENT, color: "#1a2e05" } : { color: "var(--text-primary)", border: "1px solid var(--border)" }}
                >
                  {t.key === "blank" ? "New blank note" : t.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="shrink-0 border-b px-4 py-2.5 space-y-2" style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}>
              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={() => select(null)} className="md:hidden p-1 -ml-1 rounded" style={{ color: "var(--text-secondary)" }} aria-label="Back to notes">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <input
                  value={draft.title}
                  onChange={(e) => update({ title: e.target.value })}
                  placeholder="Untitled note"
                  className="flex-1 min-w-40 bg-transparent text-base font-semibold outline-none"
                  style={{ color: "var(--text-primary)" }}
                />
                <SaveIndicator state={saveState === "saving" ? "saving" : "saved"} className="hidden sm:inline-flex shrink-0" />
                <UndoRedoButtons history={history} />
                <button
                  onClick={() => update({ pinned: !draft.pinned })}
                  className="p-1.5 rounded-md"
                  style={{ color: draft.pinned ? ACCENT : "var(--text-secondary)", border: "1px solid var(--border)" }}
                  title={draft.pinned ? "Unpin in Notebook" : "Pin in Notebook"}
                  aria-label={draft.pinned ? "Unpin in Notebook" : "Pin in Notebook"}
                >
                  {draft.pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                </button>
                <button onClick={deleteNote} className="p-1.5 rounded-md" style={{ color: "var(--red)", border: "1px solid var(--border)" }} title="Delete note" aria-label="Delete note">
                  <Trash2 className="w-4 h-4" />
                </button>
                <HelpButton topic="notebook" className="md:hidden" />
              </div>

              <div className="flex items-center gap-3 flex-wrap text-xs">
                <label className="flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
                  <Folder className="w-3.5 h-3.5" />
                  <input
                    value={draft.folder ?? ""}
                    onChange={(e) => update({ folder: e.target.value })}
                    list="notebook-folders"
                    placeholder="No folder"
                    className="w-32 px-1.5 py-0.5 rounded outline-none"
                    style={inputStyle}
                  />
                  <datalist id="notebook-folders">
                    {folders.map((f) => (
                      <option key={f} value={f} />
                    ))}
                  </datalist>
                </label>

                <div className="flex items-center gap-1 flex-wrap">
                  <Tag className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} />
                  {draft.tags.map((t) => (
                    <span key={t} className="flex items-center gap-0.5 pl-1.5 pr-1 py-0.5 rounded-full" style={{ background: "var(--bg-card)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
                      {t}
                      <button onClick={() => update({ tags: draft.tags.filter((x) => x !== t) })} style={{ color: "var(--text-muted)" }} aria-label={`Remove tag ${t}`}>
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  <input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === ",") {
                        e.preventDefault();
                        addTag();
                      }
                    }}
                    onBlur={addTag}
                    placeholder="Add tag"
                    className="w-20 bg-transparent outline-none"
                    style={{ color: "var(--text-primary)" }}
                  />
                </div>

                {progress.total > 0 && (
                  <span className="flex items-center gap-1.5" style={{ color: "var(--text-secondary)" }}>
                    <ListChecks className="w-3.5 h-3.5" style={{ color: ACCENT }} />
                    {progress.done}/{progress.total} done
                    <span className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-card)" }}>
                      <span className="block h-full" style={{ width: `${(progress.done / progress.total) * 100}%`, background: ACCENT }} />
                    </span>
                  </span>
                )}

                <div className="ml-auto flex items-center rounded-md overflow-hidden" style={{ border: "1px solid var(--border)" }}>
                  {(
                    [
                      ["edit", PenLine, "Write"],
                      ["split", Columns2, "Side by side"],
                      ["preview", Eye, "Preview"],
                    ] as const
                  ).map(([mode, Icon, label]) => (
                    <button
                      key={mode}
                      onClick={() => setViewMode(mode)}
                      className={`${mode === "split" ? "hidden lg:flex" : "flex"} items-center gap-1 px-2 py-1`}
                      style={{ background: viewMode === mode ? "var(--bg-hover)" : "transparent", color: viewMode === mode ? "var(--text-primary)" : "var(--text-muted)" }}
                      title={label}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span className="hidden xl:inline">{label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Body */}
            <div className={`flex-1 min-h-0 grid ${viewMode === "split" ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1"}`}>
              {viewMode !== "preview" && (
                <div className={`relative min-h-0 flex flex-col ${viewMode === "split" ? "lg:border-r" : ""}`} style={{ borderColor: "var(--border)" }}>
                  <div className="px-4 pt-2 text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                    Markdown · type [[ to link a note or story entry
                  </div>
                  <div className="relative flex-1 min-h-0">
                    <textarea
                      ref={textareaRef}
                      value={draft.content}
                      onChange={(e) => {
                        update({ content: e.target.value });
                        checkAutocomplete(e.target);
                      }}
                      onKeyDown={onEditorKeyDown}
                      onKeyUp={(e) => {
                        if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) checkAutocomplete(e.currentTarget);
                      }}
                      onClick={(e) => checkAutocomplete(e.currentTarget)}
                      onBlur={() => {
                        setTimeout(() => setComplete(null), 150);
                        flush();
                      }}
                      onScroll={() => setComplete(null)}
                      placeholder={"Start writing…\n\n- [ ] A to-do item\n## A heading\n[[Another note]]"}
                      spellCheck
                      className="absolute inset-0 w-full h-full resize-none bg-transparent px-4 py-3 text-sm font-mono leading-6 outline-none"
                      style={{ color: "var(--text-primary)" }}
                    />
                    {complete && suggestions.length > 0 && (
                      <div
                        className="absolute z-20 w-64 max-h-60 overflow-y-auto p-1 rounded-lg shadow-xl"
                        style={{ top: complete.top, left: complete.left, background: "var(--bg-card)", border: "1px solid var(--border)" }}
                      >
                        {suggestions.map((s, idx) => (
                          <button
                            key={`${s.type}:${s.id}`}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              insertSuggestion(s.title);
                            }}
                            className="w-full flex items-center gap-2 text-left text-xs px-2 py-1.5 rounded"
                            style={{ background: idx === complete.index ? "var(--bg-hover)" : undefined, color: "var(--text-primary)" }}
                          >
                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: s.type === "note" ? ACCENT : "#fb923c" }} />
                            <span className="truncate flex-1">{s.title}</span>
                            <span style={{ color: "var(--text-muted)" }}>{s.type === "note" ? "Note" : "Story"}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {viewMode !== "edit" && (
                <div className="min-h-0 overflow-y-auto px-5 py-3">
                  <div className="text-[10px] uppercase tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>
                    Preview · click checkboxes to tick them off
                  </div>
                  <MarkdownPreview content={draft.content} ctx={renderCtx} />
                  <div className="mt-6 pt-4 border-t" style={{ borderColor: "var(--border)" }}>
                    <LinkedAssets projectId={projectId} type="note" id={draft.id} layout="panel" />
                  </div>
                </div>
              )}
            </div>

            {viewMode === "edit" && (
              <div className="shrink-0 border-t px-4 py-3" style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}>
                <LinkedAssets projectId={projectId} type="note" id={draft.id} layout="row" />
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
