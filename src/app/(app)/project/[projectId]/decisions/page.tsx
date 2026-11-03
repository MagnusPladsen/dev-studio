"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowRight, BookOpenText, ChevronLeft, GitPullRequestArrow, PenLine, Scale, Tag, Trash2, X } from "lucide-react";
import { v4 as uuid } from "uuid";
import type { Decision, DecisionStatus, Note } from "@/types";
import { storage } from "@/lib/storage";
import { normalizeTag } from "@/lib/tags";
import { assetHref } from "@/lib/assets";
import { addLink } from "@/lib/links";
import { registerAutosaveFlush } from "@/lib/autosave-registry";
import { downloadBlob } from "@/lib/download";
import {
  DECISION_STATUSES,
  createDecision,
  decisionCode,
  decisionFileName,
  decisionLogMarkdown,
  decisionToMarkdown,
  nextDecisionNumber,
  sortDecisions,
  supersedeDecision,
  supersededDecisions,
  type DecisionField,
} from "@/lib/decisions";
import { useOpenParam, useTrackOpenAsset, useStorageVersion } from "@/hooks/useStorage";
import { useRemoteChanges } from "@/hooks/useRemoteChanges";
import { useHistory } from "@/hooks/useHistory";
import { useAssetMenu } from "@/components/AssetContextMenu";
import { LinkedAssets } from "@/components/LinkedAssets";
import { UndoRedoButtons } from "@/components/UndoRedoButtons";
import { SaveIndicator } from "@/components/SaveIndicator";
import { ExportMenu, type ExportItem } from "@/components/ExportMenu";
import { ImportMenu } from "@/components/ImportMenu";
import { ImportDropZone } from "@/components/ImportDropZone";
import { useImport, type ImportController } from "@/hooks/useImport";
import { importAsNewAssets } from "@/lib/import";
import { DECISION_IMPORTERS } from "@/lib/import/decisions";
import { HelpButton } from "@/components/HelpButton";
import { toggleChecklistLine, type RenderCtx, type WikiTarget } from "@/components/MarkdownPreview";
import { DecisionList, type StatusFilter } from "@/components/decisions/DecisionList";
import { DecisionFields, type FieldsMode } from "@/components/decisions/DecisionFields";
import { StatusBadge } from "@/components/decisions/StatusBadge";

const SAVE_DELAY = 600;

const iconButton = "p-1.5 rounded-md shrink-0";
const iconButtonStyle = { color: "var(--text-primary)", border: "1px solid var(--border)" };
const inputStyle = { background: "var(--bg-primary)", color: "var(--text-primary)", border: "1px solid var(--border)" };

function hasWriting(decision: Decision): boolean {
  return Boolean(decision.context.trim() || decision.decision.trim() || decision.options.trim() || decision.consequences.trim());
}

/** Saves the open decision a moment after typing stops, straight away on Ctrl/⌘+S, switching or leaving. */
function useDecisionDraft(projectId: string) {
  const [draft, setDraft] = useState<Decision | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const savedRef = useRef<Decision | null>(null);
  const draftRef = useRef<Decision | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const writeNow = useCallback(
    (decision: Decision) => {
      // skip if the decision was deleted meanwhile
      if (storage.getById("decisions", decision.id, projectId)) storage.save("decisions", { ...decision, updatedAt: new Date().toISOString() }, projectId);
      savedRef.current = decision;
      setIsSaving(false);
    },
    [projectId]
  );

  const flush = useCallback(() => {
    if (!timerRef.current) return;
    clearTimeout(timerRef.current);
    timerRef.current = null;
    const pending = draftRef.current;
    if (pending && pending !== savedRef.current) writeNow(pending);
  }, [writeNow]);

  useEffect(() => {
    if (!draft || draft === savedRef.current) return;
    setIsSaving(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      writeNow(draft);
    }, SAVE_DELAY);
  }, [draft, writeNow]);

  useEffect(() => registerAutosaveFlush(flush), [flush]);
  useEffect(() => () => flush(), [flush]);
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

  /** Shows a stored decision (or nothing) without saving it again. */
  const load = useCallback(
    (decision: Decision | null) => {
      flush();
      savedRef.current = decision;
      setDraft(decision);
      setIsSaving(false);
    },
    [flush]
  );

  const discard = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    load(null);
  }, [load]);

  const hasPending = useCallback(() => timerRef.current !== null || draftRef.current !== savedRef.current, []);

  return { draft, setDraft, isSaving, flush, load, discard, hasPending };
}

export default function DecisionLogPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;
  const version = useStorageVersion();
  const { assetTriggerProps } = useAssetMenu();
  const { draft, setDraft, isSaving, flush, load, discard, hasPending } = useDecisionDraft(projectId);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [mode, setMode] = useState<FieldsMode>("read");
  const [tagInput, setTagInput] = useState("");

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stored = useMemo(() => storage.getAll("decisions", projectId), [projectId, version]);
  // the open decision shows its live draft in the list
  const decisions = useMemo(() => (draft ? stored.map((d) => (d.id === draft.id ? draft : d)) : stored), [stored, draft]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const wikiTargets = useMemo(() => wikiTargetIndex(projectId), [projectId, version]);

  // Changes from another tab or device replace the open decision unless it has unsaved edits (see useRemoteChanges).
  const remoteRevision = useRemoteChanges(["decisions"], projectId, () => {
    const stored = draft ? storage.getById("decisions", draft.id, projectId) : undefined;
    if (!stored || hasPending()) return false;
    load(stored);
    return true;
  });
  const history = useHistory<Decision | null>(draft, (v) => setDraft(v), draft ? `${draft.id}:${remoteRevision}` : undefined);
  const rootRef = useRef<HTMLDivElement>(null);

  const select = useCallback(
    (id: string | null) => {
      const decision = id ? storage.getById("decisions", id, projectId) ?? null : null;
      load(decision);
      setTagInput("");
      if (decision) setMode(hasWriting(decision) ? "read" : "write");
    },
    [load, projectId]
  );

  useOpenParam((id) => select(id));
  useTrackOpenAsset(draft ? { type: "decision", id: draft.id } : null);

  // the open decision was deleted elsewhere (another tab, the asset menu, sign-out)
  useEffect(() => {
    if (draft && !storage.getById("decisions", draft.id, projectId) && !hasPending()) load(null);
  }, [version, draft, projectId, hasPending, load]);

  function update(patch: Partial<Decision>) {
    setDraft((d) => (d ? { ...d, ...patch } : d));
  }

  // Imported decisions are numbered after the last one in this log, in their original order.
  const imports = useImport<Decision>({
    importers: DECISION_IMPORTERS,
    noun: ["decision", "decisions"],
    history,
    openId: draft?.id ?? null,
    apply: ({ items }) => {
      flush();
      const first = nextDecisionNumber(storage.getAll("decisions", projectId));
      return importAsNewAssets("decisions", projectId, items.map((decision, index) => ({ ...decision, number: first + index })), {
        previousId: draft?.id ?? null,
        open: (decision) => {
          select(decision.id);
          setFilter("all");
        },
        back: (previous) => select(previous?.id ?? null),
      });
    },
  });

  function create() {
    flush();
    const decision = createDecision(projectId, storage.getAll("decisions", projectId));
    storage.save("decisions", decision, projectId);
    select(decision.id);
    setFilter("all");
  }

  function supersede() {
    if (!draft) return;
    flush();
    const all = storage.getAll("decisions", projectId);
    const current = all.find((d) => d.id === draft.id) ?? draft;
    const { replaced, replacement } = supersedeDecision(current, all);
    storage.save("decisions", replaced, projectId);
    storage.save("decisions", replacement, projectId);
    addLink(projectId, { type: "decision", id: replacement.id }, { type: "decision", id: replaced.id });
    select(replacement.id);
    setMode("write");
    setFilter("all");
  }

  function remove() {
    if (!draft) return;
    if (!confirm(`Delete ${decisionCode(draft.number)} “${draft.title || "Untitled decision"}”? Its links are removed too.`)) return;
    storage.delete("decisions", draft.id, projectId);
    for (const d of storage.getAll("decisions", projectId)) {
      if (d.supersededBy === draft.id) storage.save("decisions", { ...d, supersededBy: undefined, updatedAt: new Date().toISOString() }, projectId);
    }
    discard();
  }

  function addTag() {
    const tag = normalizeTag("decision", tagInput);
    setTagInput("");
    if (draft && tag && !draft.tags.includes(tag)) update({ tags: [...draft.tags, tag] });
  }

  function openWikiLink(title: string, target: WikiTarget | undefined) {
    flush();
    if (target) {
      router.push(assetHref(projectId, target.type, target.id));
      return;
    }
    if (!draft) return;
    const note = newNote(projectId, title);
    addLink(projectId, { type: "decision", id: draft.id }, { type: "note", id: note.id });
    router.push(assetHref(projectId, "note", note.id));
  }

  const renderCtx = (field: DecisionField): RenderCtx => ({
    resolve: (title) => wikiTargets.get(title.trim().toLowerCase()),
    triggerProps: (target) => assetTriggerProps({ type: target.type, id: target.id }),
    onWiki: openWikiLink,
    onToggle: (lineIndex) => {
      if (draft) update({ [field]: toggleChecklistLine(draft[field], lineIndex) });
    },
  });

  const exportItems = decisionExports(projectId, draft, decisions);

  return (
    <div ref={rootRef} className="flex h-full overflow-hidden" style={{ background: "var(--bg-primary)" }}>
      <ImportDropZone imports={imports} target={rootRef} />
      <DecisionList
        projectId={projectId}
        decisions={decisions}
        openId={draft?.id ?? null}
        query={query}
        filter={filter}
        className={draft ? "hidden md:flex" : "flex"}
        onQuery={setQuery}
        onFilter={setFilter}
        onOpen={select}
        onCreate={create}
        imports={imports}
      />

      <section className={`${draft ? "flex" : "hidden md:flex"} flex-1 min-w-0 flex-col`}>
        {!draft ? (
          <EmptyEditor hasDecisions={decisions.length > 0} onCreate={create} exportItems={exportItems} imports={imports} />
        ) : (
          <>
            <div className="shrink-0 border-b px-4 py-2.5 space-y-2" style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}>
              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={() => select(null)} className="md:hidden p-1 -ml-1 rounded" style={{ color: "var(--text-primary)" }} title="Back to decisions" aria-label="Back to decisions">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs font-mono tabular-nums px-1.5 py-0.5 rounded shrink-0" style={{ background: "var(--bg-card)", color: "var(--accent)", border: "1px solid var(--border)" }}>
                  {decisionCode(draft.number)}
                </span>
                <input
                  value={draft.title}
                  onChange={(e) => update({ title: e.target.value })}
                  placeholder="Untitled decision"
                  aria-label="Decision title"
                  className="flex-1 min-w-40 bg-transparent text-base font-semibold outline-none"
                  style={{ color: "var(--text-primary)" }}
                />
                <SaveIndicator state={isSaving ? "saving" : "saved"} className="hidden sm:inline-flex shrink-0" />
                <UndoRedoButtons history={imports.history} />
                <ModeToggle mode={mode} onMode={setMode} />
                <button
                  onClick={supersede}
                  disabled={draft.status === "superseded"}
                  className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs shrink-0 disabled:opacity-40"
                  style={iconButtonStyle}
                  title={draft.status === "superseded" ? "Already superseded" : "Write a new decision that replaces this one"}
                  aria-label="Supersede"
                >
                  <GitPullRequestArrow className="w-3.5 h-3.5" />
                  <span className="max-md:hidden">Supersede</span>
                </button>
                <button onClick={remove} className={iconButton} style={{ ...iconButtonStyle, color: "var(--red)" }} title="Delete decision" aria-label="Delete decision">
                  <Trash2 className="w-4 h-4" />
                </button>
                <HelpButton topic="decisions" className="md:hidden" />
                <ImportMenu imports={imports} />
                <ExportMenu items={exportItems} />
              </div>
              <MetaRow
                decision={draft}
                decisions={decisions}
                tagInput={tagInput}
                onTagInput={setTagInput}
                onAddTag={addTag}
                onChange={update}
              />
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto">
              <div className="max-w-3xl mx-auto px-4 md:px-6 py-4 space-y-5">
                <SupersedeLinks decision={draft} decisions={decisions} onOpen={(id) => select(id)} />
                <DecisionFields decision={draft} mode={mode} renderCtx={renderCtx} onChange={(field, value) => update({ [field]: value })} onBlur={flush} />
                <div className="pt-4 border-t" style={{ borderColor: "var(--border)" }}>
                  <LinkedAssets projectId={projectId} type="decision" id={draft.id} layout="panel" />
                </div>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

// ─── pieces ──────────────────────────────────────────────────────────

function ModeToggle({ mode, onMode }: { mode: FieldsMode; onMode(mode: FieldsMode): void }) {
  const options = [
    ["write", PenLine, "Write"],
    ["read", BookOpenText, "Read"],
  ] as const;
  return (
    <div className="flex items-center rounded-md overflow-hidden shrink-0" style={{ border: "1px solid var(--border)" }} role="group" aria-label="View">
      {options.map(([value, Icon, label]) => (
        <button
          key={value}
          onClick={() => onMode(value)}
          aria-pressed={mode === value}
          className="flex items-center gap-1 px-2 py-1"
          style={{ background: mode === value ? "var(--bg-hover)" : "transparent", color: mode === value ? "var(--text-primary)" : "var(--text-secondary)" }}
          title={label}
          aria-label={label}
        >
          <Icon className="w-3.5 h-3.5" />
          <span className="hidden xl:inline text-xs">{label}</span>
        </button>
      ))}
    </div>
  );
}

interface MetaRowProps {
  decision: Decision;
  decisions: Decision[];
  tagInput: string;
  onTagInput(value: string): void;
  onAddTag(): void;
  onChange(patch: Partial<Decision>): void;
}

function MetaRow({ decision, decisions, tagInput, onTagInput, onAddTag, onChange }: MetaRowProps) {
  const others = sortDecisions(decisions.filter((d) => d.id !== decision.id));
  return (
    <div className="flex items-center gap-x-3 gap-y-2 flex-wrap text-xs">
      <label className="flex items-center gap-1.5" style={{ color: "var(--text-secondary)" }}>
        Status
        <select
          value={decision.status}
          onChange={(e) => {
            const status = e.target.value as DecisionStatus;
            onChange({ status, supersededBy: status === "superseded" ? decision.supersededBy : undefined });
          }}
          className="px-1.5 py-0.5 rounded outline-none"
          style={inputStyle}
        >
          {DECISION_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-1.5" style={{ color: "var(--text-secondary)" }}>
        Date
        <input type="date" value={decision.date} onChange={(e) => onChange({ date: e.target.value })} className="px-1.5 py-0.5 rounded outline-none [color-scheme:dark]" style={inputStyle} />
      </label>
      {decision.status === "superseded" && (
        <label className="flex items-center gap-1.5 min-w-0" style={{ color: "var(--text-secondary)" }}>
          Superseded by
          <select
            value={decision.supersededBy ?? ""}
            onChange={(e) => onChange({ supersededBy: e.target.value || undefined })}
            className="px-1.5 py-0.5 rounded outline-none max-w-48"
            style={inputStyle}
          >
            <option value="">Nothing yet</option>
            {others.map((d) => (
              <option key={d.id} value={d.id}>
                {decisionCode(d.number)} {d.title}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="flex items-center gap-1 flex-wrap">
        <Tag className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} />
        {decision.tags.map((t) => (
          <span key={t} className="flex items-center gap-0.5 pl-1.5 pr-1 py-0.5 rounded-full" style={{ background: "var(--bg-card)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
            {t}
            <button onClick={() => onChange({ tags: decision.tags.filter((x) => x !== t) })} style={{ color: "var(--text-muted)" }} title={`Remove tag ${t}`} aria-label={`Remove tag ${t}`}>
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input
          value={tagInput}
          onChange={(e) => onTagInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              onAddTag();
            }
          }}
          onBlur={onAddTag}
          placeholder="Add tag"
          aria-label="Add tag"
          className="w-20 bg-transparent outline-none"
          style={{ color: "var(--text-primary)" }}
        />
      </div>
    </div>
  );
}

/** "Superseded by …" and "Supersedes …" banners that jump to the other record. */
function SupersedeLinks({ decision, decisions, onOpen }: { decision: Decision; decisions: Decision[]; onOpen(id: string): void }) {
  const replacement = decision.supersededBy ? decisions.find((d) => d.id === decision.supersededBy) : undefined;
  const replaces = supersededDecisions(decision, decisions);
  if (!replacement && replaces.length === 0) return null;
  return (
    <div className="space-y-1.5">
      {replacement && <SupersedeBanner label="Superseded by" decision={replacement} onOpen={onOpen} isProminent />}
      {replaces.map((d) => (
        <SupersedeBanner key={d.id} label="Supersedes" decision={d} onOpen={onOpen} />
      ))}
    </div>
  );
}

function SupersedeBanner({ label, decision, onOpen, isProminent = false }: { label: string; decision: Decision; onOpen(id: string): void; isProminent?: boolean }) {
  return (
    <button
      onClick={() => onOpen(decision.id)}
      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-xs hover:bg-[var(--bg-hover)]"
      style={{
        background: isProminent ? "color-mix(in srgb, var(--accent) 10%, var(--bg-card))" : "var(--bg-card)",
        border: `1px solid ${isProminent ? "color-mix(in srgb, var(--accent) 35%, var(--border))" : "var(--border)"}`,
        color: "var(--text-secondary)",
      }}
    >
      <GitPullRequestArrow className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--accent)" }} />
      <span className="shrink-0">{label}</span>
      <span className="font-mono shrink-0" style={{ color: "var(--text-primary)" }}>
        {decisionCode(decision.number)}
      </span>
      <span className="truncate" style={{ color: "var(--text-primary)" }}>
        {decision.title}
      </span>
      <StatusBadge status={decision.status} className="ml-auto" />
      <ArrowRight className="w-3.5 h-3.5 shrink-0" />
    </button>
  );
}

function EmptyEditor({ hasDecisions, onCreate, exportItems, imports }: { hasDecisions: boolean; onCreate(): void; exportItems: ExportItem[]; imports: ImportController }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: "color-mix(in srgb, var(--accent) 12%, transparent)", color: "var(--accent)" }}>
        <Scale className="w-7 h-7" />
      </div>
      <p className="font-medium mb-1" style={{ color: "var(--text-primary)" }}>
        {hasDecisions ? "Pick a decision, or record a new one" : "No decisions recorded yet"}
      </p>
      <p className="text-sm max-w-sm mb-5" style={{ color: "var(--text-secondary)" }}>
        Write down each important choice: the context, the options you looked at, what you decided and what follows from it. Future you will thank you.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <button onClick={onCreate} className="text-xs px-3 py-1.5 rounded-lg font-medium" style={{ background: "var(--accent)", color: "var(--on-accent)" }}>
          New decision
        </button>
        <ImportMenu imports={imports} />
        {hasDecisions && <ExportMenu items={exportItems} label="Export log" />}
      </div>
    </div>
  );
}

// ─── helpers ─────────────────────────────────────────────────────────

/** [[Title]] in a field opens the note or wiki page with that title. */
function wikiTargetIndex(projectId: string): Map<string, WikiTarget> {
  const map = new Map<string, WikiTarget>();
  for (const s of storage.getAll("stories", projectId)) map.set(s.title.trim().toLowerCase(), { type: "story", id: s.id, title: s.title });
  for (const n of storage.getAll("notes", projectId)) map.set(n.title.trim().toLowerCase(), { type: "note", id: n.id, title: n.title });
  return map;
}

function newNote(projectId: string, title: string): Note {
  const now = new Date().toISOString();
  const note: Note = { id: uuid(), projectId, title, content: "", tags: [], createdAt: now, updatedAt: now };
  storage.save("notes", note, projectId);
  return note;
}

function decisionExports(projectId: string, open: Decision | null, decisions: Decision[]): ExportItem[] {
  const projectName = storage.getById("projects", projectId)?.name ?? "Project";
  const fileBase = projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "project";
  const markdown = (text: string) => new Blob([text], { type: "text/markdown" });
  const items: ExportItem[] = [];
  if (open) {
    items.push({
      label: "This decision (Markdown)",
      description: `${decisionFileName(open)}, one ADR file`,
      onClick: () => downloadBlob(decisionFileName(open), markdown(decisionToMarkdown(open, decisions))),
    });
  }
  items.push(
    {
      label: "Decision log (Markdown)",
      description: "Every decision in one file, with an index",
      disabled: decisions.length === 0,
      onClick: () => downloadBlob(`${fileBase}-decision-log.md`, markdown(decisionLogMarkdown(projectName, decisions))),
    },
    {
      label: "Decision log (JSON)",
      description: "Every decision with all its fields",
      disabled: decisions.length === 0,
      onClick: () =>
        downloadBlob(`${fileBase}-decisions.json`, new Blob([JSON.stringify(sortDecisions(decisions), null, 2)], { type: "application/json" })),
    }
  );
  return items;
}
