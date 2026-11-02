"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useHistory } from "@/hooks/useHistory";
import { UndoRedoButtons } from "@/components/UndoRedoButtons";
import { useParams, useRouter } from "next/navigation";
import {
  Plus,
  Search,
  Trash2,
  User,
  MapPin,
  Box,
  Zap,
  Scroll,
  Flag,
  FileText,
  X,
  Network,
  ChevronDown,
  ChevronRight,
  Tag,
  BookOpen,
  ArrowLeft,
  CornerDownLeft,
} from "lucide-react";
import { v4 as uuid } from "uuid";
import { storage } from "@/lib/storage";
import { dropDeletedLinkTargets, getRelated, wikiTargets } from "@/lib/links";
import { assetHref } from "@/lib/assets";
import { LinkedAssets } from "@/components/LinkedAssets";
import { StoryGraph } from "@/components/story/StoryGraph";
import { useOpenParam, useTrackOpenAsset, useStorageVersion } from "@/hooks/useStorage";
import type { StoryEntry } from "@/types";
import { useAutosave } from "@/hooks/useAutosave";
import { SaveIndicator } from "@/components/SaveIndicator";
import { ExamplesBar } from "@/components/ExamplesBar";
import { HelpButton } from "@/components/HelpButton";
import { useAssetMenu } from "@/components/AssetContextMenu";
import { AssetMenuButton, AssetPinButton, PasteButton } from "@/components/AssetMenuButton";
import { useToast } from "@/components/Toast";

const ENTRY_TYPES = [
  { value: "character" as const, label: "Character", icon: User, color: "#a78bfa" },
  { value: "location" as const, label: "Location", icon: MapPin, color: "#60a5fa" },
  { value: "item" as const, label: "Item", icon: Box, color: "#fbbf24" },
  { value: "event" as const, label: "Event", icon: Zap, color: "#f87171" },
  { value: "lore" as const, label: "Lore", icon: Scroll, color: "#fb923c" },
  { value: "quest" as const, label: "Quest", icon: Flag, color: "#34d399" },
  { value: "note" as const, label: "Other", icon: FileText, color: "#8888a0" },
] as const;

type EntryType = (typeof ENTRY_TYPES)[number]["value"];

const TEMPLATES: Partial<Record<EntryType, string>> = {
  character: "## Appearance\n\n## Personality\n\n## Backstory\n\n## Relationships\n",
  location: "## Description\n\n## Inhabitants\n\n## Points of Interest\n",
  item: "## Description\n\n## Properties\n\n## Where to Find\n",
  quest: "## Objective\n\n## Giver\n\n## Steps\n- \n\n## Reward\n",
};

const WIKI_SPLIT = /(\[\[[^\]]+\]\])/g;
const AUTOCOMPLETE = /\[\[([^\]\n]*)$/;

function getTypeMeta(type: string) {
  return ENTRY_TYPES.find((t) => t.value === type) ?? ENTRY_TYPES[6];
}

function parseWiki(raw: string) {
  const [target, alias] = raw.split("|");
  return { target: target.trim(), label: (alias ?? target).trim() };
}

interface HoverCard {
  title: string;
  x: number;
  y: number;
}

interface Autocomplete {
  query: string;
  start: number; // index of the "[[" in the content
  index: number;
}

function skippedLinksMessage(count: number): string {
  return count === 1
    ? "Skipped a link to an asset that was deleted."
    : `Skipped ${count} links to assets that were deleted.`;
}

export default function StoryPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;
  const { assetTriggerProps, pasteTriggerProps } = useAssetMenu();
  const version = useStorageVersion();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ id: string; content: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [showNewForm, setShowNewForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newType, setNewType] = useState<EntryType>("character");
  const [showGraph, setShowGraph] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [hover, setHover] = useState<HoverCard | null>(null);
  const [ac, setAc] = useState<Autocomplete | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // phones show one pane at a time: the entry list, or the open entry (edit or preview)
  const [mobileView, setMobileView] = useState<"list" | "entry">("list");
  const [mobilePane, setMobilePane] = useState<"edit" | "preview">("preview");

  const entries = useMemo(
    () => storage.getAll("stories", projectId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectId, version]
  );

  const byTitle = useMemo(() => new Map(entries.map((e) => [e.title.trim().toLowerCase(), e])), [entries]);

  const stored = useMemo(
    () => entries.find((e) => e.id === selectedId) ?? (selectedId === null ? entries[0] : undefined) ?? null,
    [entries, selectedId]
  );
  const dirty = !!stored && draft?.id === stored.id && draft.content !== stored.content;
  const selected = useMemo(
    () => (stored && draft?.id === stored.id ? { ...stored, content: draft.content } : stored),
    [stored, draft]
  );

  useOpenParam((id) => {
    if (storage.getById("stories", id, projectId)) selectEntry(id);
  });
  useTrackOpenAsset(stored ? { type: "story", id: stored.id } : null);

  const { showToast } = useToast();

  // Entry-level undo (title, type, tags, links, saved content). Typing in the editor uses the textarea's own undo.
  const history = useHistory(
    stored,
    (v) => {
      if (!v) return;
      setDraft(null);
      const { links, dropped } = dropDeletedLinkTargets(projectId, v.links ?? []);
      storage.save("stories", { ...v, links, updatedAt: new Date().toISOString() }, projectId);
      if (dropped > 0) showToast({ message: skippedLinksMessage(dropped) });
    },
    stored?.id
  );

  const grouped = useMemo(() => {
    const groups: Record<string, StoryEntry[]> = {};
    for (const t of ENTRY_TYPES) groups[t.value] = [];
    const q = searchQuery.toLowerCase();
    for (const entry of entries) {
      if (q && !entry.title.toLowerCase().includes(q) && !entry.tags.some((t) => t.toLowerCase().includes(q))) continue;
      (groups[entry.type] ??= []).push(entry);
    }
    return groups;
  }, [entries, searchQuery]);

  const saveEntry = useCallback(
    (patch: Partial<StoryEntry>) => {
      if (!selected) return;
      const updated = { ...selected, ...patch, updatedAt: new Date().toISOString() };
      storage.save("stories", updated, projectId);
      if (patch.content !== undefined || draft?.id === updated.id) setDraft(null);
    },
    [selected, projectId, draft]
  );

  function flushDraft() {
    if (dirty && selected) saveEntry({ content: selected.content });
  }

  // Typing saves itself shortly after you stop; switching entry or leaving saves straight away.
  const autosave = useAutosave(draft, (d) => {
    if (!d) return;
    const entry = storage.getById("stories", d.id, projectId);
    if (entry && entry.content !== d.content) storage.save("stories", { ...entry, content: d.content, updatedAt: new Date().toISOString() }, projectId);
  });

  const flushAutosave = autosave.flush;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        flushAutosave();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flushAutosave]);

  function selectEntry(id: string) {
    flushDraft();
    setDraft(null);
    setAc(null);
    setHover(null);
    setSelectedId(id);
    setMobileView("entry");
  }

  function createEntry(title = newTitle, type: EntryType = newType) {
    if (!title.trim()) return;
    flushDraft();
    const now = new Date().toISOString();
    const entry: StoryEntry = {
      id: uuid(),
      projectId,
      title: title.trim(),
      content: TEMPLATES[type] ?? "",
      type,
      links: [],
      tags: [],
      createdAt: now,
      updatedAt: now,
    };
    storage.save("stories", entry, projectId);
    setDraft(null);
    setSelectedId(entry.id);
    setMobileView("entry");
    setMobilePane("edit");
    setShowNewForm(false);
    setNewTitle("");
  }

  function deleteEntry(id: string) {
    storage.delete("stories", id, projectId);
    setDraft(null);
    if (stored?.id === id) setSelectedId(entries.find((e) => e.id !== id)?.id ?? null);
  }

  function toggleGroup(type: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  function addTag() {
    if (!tagInput.trim() || !selected) return;
    const tag = tagInput.trim().toLowerCase();
    if (!selected.tags.includes(tag)) saveEntry({ tags: [...selected.tags, tag] });
    setTagInput("");
  }

  function removeTag(tag: string) {
    if (!selected) return;
    saveEntry({ tags: selected.tags.filter((t) => t !== tag) });
  }

  // ── [[ autocomplete ──
  const acOptions = useMemo(() => {
    if (!ac || !selected) return [];
    const q = ac.query.toLowerCase();
    return entries
      .filter((e) => e.id !== selected.id && e.title.toLowerCase().includes(q))
      .sort((a, b) => Number(!a.title.toLowerCase().startsWith(q)) - Number(!b.title.toLowerCase().startsWith(q)))
      .slice(0, 8);
  }, [ac, entries, selected]);

  function updateAutocomplete(content: string, caret: number) {
    const m = content.slice(0, caret).match(AUTOCOMPLETE);
    if (!m) {
      setAc(null);
      return;
    }
    setAc((prev) => ({ query: m[1], start: caret - m[0].length, index: prev?.query === m[1] ? prev.index : 0 }));
  }

  function insertLink(title: string) {
    const ta = textareaRef.current;
    if (!ta || !ac || !selected) return;
    const caret = ta.selectionStart;
    const content = selected.content;
    const after = content.slice(caret).startsWith("]]") ? content.slice(caret + 2) : content.slice(caret);
    const next = `${content.slice(0, ac.start)}[[${title}]]${after}`;
    const pos = ac.start + title.length + 4;
    setDraft({ id: selected.id, content: next });
    setAc(null);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(pos, pos);
    });
  }

  function onEditorKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!ac || acOptions.length === 0) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const d = e.key === "ArrowDown" ? 1 : -1;
      setAc({ ...ac, index: (ac.index + d + acOptions.length) % acOptions.length });
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      insertLink(acOptions[ac.index].title);
    } else if (e.key === "Escape") {
      setAc(null);
    }
  }

  // ── preview ──
  function renderLine(line: string, key: string) {
    if (line.startsWith("## ")) {
      return (
        <strong key={key} className="block text-lg mt-4 mb-2" style={{ color: "var(--text-primary)" }}>
          {renderInline(line.slice(3), key)}
        </strong>
      );
    }
    if (line.startsWith("# ")) {
      return (
        <strong key={key} className="block text-xl mt-4 mb-2" style={{ color: "var(--text-primary)" }}>
          {renderInline(line.slice(2), key)}
        </strong>
      );
    }
    if (line.startsWith("- ")) {
      return (
        <span key={key} className="block pl-4">
          • {renderInline(line.slice(2), key)}
        </span>
      );
    }
    return (
      <span key={key} className="block min-h-[1.5em]">
        {renderInline(line, key)}
      </span>
    );
  }

  function renderInline(text: string, key: string) {
    return text.split(WIKI_SPLIT).map((part, i) => {
      const match = part.match(/^\[\[([^\]]+)\]\]$/);
      if (!match) return <span key={`${key}-${i}`}>{part}</span>;
      const { target: name, label } = parseWiki(match[1]);
      const target = byTitle.get(name.toLowerCase());
      if (target) {
        const meta = getTypeMeta(target.type);
        return (
          <button
            key={`${key}-${i}`}
            {...assetTriggerProps({ type: "story", id: target.id })}
            onClick={() => selectEntry(target.id)}
            onMouseEnter={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setHover({ title: target.title, x: r.left, y: r.bottom + 6 });
            }}
            onMouseLeave={() => setHover(null)}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-sm font-medium transition-colors"
            style={{ background: `${meta.color}20`, color: meta.color }}
          >
            <meta.icon className="w-3 h-3" />
            {label}
          </button>
        );
      }
      return (
        <button
          key={`${key}-${i}`}
          onClick={() => createEntry(name, "note")}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-sm border border-dashed"
          style={{ borderColor: "var(--red)", color: "var(--red)" }}
          title={`No entry called "${name}" yet`}
        >
          <Plus className="w-3 h-3" />
          Create &lsquo;{name}&rsquo;
        </button>
      );
    });
  }

  const hoverEntry = hover ? byTitle.get(hover.title.toLowerCase()) : undefined;
  const hoverRelated = useMemo(
    () => (hoverEntry ? getRelated(projectId, "story", hoverEntry.id) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hoverEntry, projectId, version]
  );
  const hoverSprite = hoverRelated.find((r) => r.type === "sprite" && r.thumbnail);

  // ── backlinks (entries whose text mentions this one) ──
  const backlinks = useMemo(() => {
    if (!selected) return [];
    const title = selected.title.trim().toLowerCase();
    return entries
      .filter((e) => e.id !== selected.id && wikiTargets(e.content).includes(title))
      .map((e) => {
        const line = e.content.split("\n").find((l) => wikiTargets(l).includes(title)) ?? "";
        return { entry: e, context: line.replace(/\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g, (_, t, a) => a || t).trim() };
      });
  }, [entries, selected]);

  if (showGraph) {
    return (
      <StoryGraph
        projectId={projectId}
        entries={entries}
        typeMeta={getTypeMeta}
        menuProps={(node) => assetTriggerProps({ type: node.assetType, id: node.id })}
        onOpen={(node) => {
          if (node.kind === "asset") return router.push(assetHref(projectId, node.assetType, node.id));
          selectEntry(node.id);
          setShowGraph(false);
        }}
        onClose={() => setShowGraph(false)}
      />
    );
  }

  return (
    <div className="flex h-full" style={{ background: "var(--bg-primary)" }}>
      {/* Sidebar */}
      <div
        className={`w-64 max-md:w-full shrink-0 border-r max-md:border-r-0 flex flex-col ${mobileView === "entry" ? "max-md:hidden" : ""}`}
        style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}
      >
        <div className="p-3 border-b space-y-2" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} />
              <input
                type="text"
                placeholder="Search entries…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-7 pr-2 py-1.5 rounded-md text-xs outline-none"
                style={{ background: "var(--bg-primary)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
              />
            </div>
            <button
              onClick={() => {
                flushDraft();
                setShowGraph(true);
              }}
              className="p-1.5 rounded-md"
              style={{ color: "var(--text-secondary)", background: "var(--bg-primary)", border: "1px solid var(--border)" }}
              title="View graph"
              aria-label="View connection graph"
            >
              <Network className="w-3.5 h-3.5" />
            </button>
            <HelpButton topic="story" />
          </div>
          <div className="flex gap-1.5">
            <button
              onClick={() => setShowNewForm(!showNewForm)}
              className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md text-xs font-medium"
              style={{ background: "var(--accent)", color: "white" }}
            >
              <Plus className="w-3.5 h-3.5" />
              New entry
            </button>
            <PasteButton type="story" />
          </div>
        </div>

        {showNewForm && (
          <div className="p-3 border-b space-y-2" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
            <input
              type="text"
              placeholder="Entry title"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="w-full px-2 py-1.5 rounded-md text-xs outline-none"
              style={{ background: "var(--bg-primary)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && createEntry()}
            />
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value as EntryType)}
              className="w-full px-2 py-1.5 rounded-md text-xs outline-none"
              style={{ background: "var(--bg-primary)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
            >
              {ENTRY_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <div className="flex gap-1.5">
              <button onClick={() => createEntry()} className="flex-1 py-1 rounded-md text-xs font-medium" style={{ background: "var(--accent)", color: "white" }}>
                Create
              </button>
              <button onClick={() => setShowNewForm(false)} className="px-3 py-1 rounded-md text-xs" style={{ color: "var(--text-primary)", border: "1px solid var(--border)" }}>
                Cancel
              </button>
            </div>
          </div>
        )}

        <div {...pasteTriggerProps("story")} className="flex-1 overflow-y-auto py-1">
          {ENTRY_TYPES.map((type) => {
            const items = grouped[type.value] ?? [];
            const collapsed = collapsedGroups.has(type.value);
            return (
              <div key={type.value}>
                <button onClick={() => toggleGroup(type.value)} className="w-full flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium" style={{ color: type.color }}>
                  {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  <type.icon className="w-3 h-3" />
                  {type.label}
                  <span className="ml-auto text-[10px] opacity-60">{items.length}</span>
                </button>
                {!collapsed &&
                  items.map((entry) => (
                    <div key={entry.id} className="group relative">
                      <button
                        {...assetTriggerProps({ type: "story", id: entry.id })}
                        onClick={() => selectEntry(entry.id)}
                        className="w-full text-left flex items-center gap-2 pl-8 pr-3 max-md:pr-9 md:pr-7 py-1.5 text-xs transition-colors"
                        style={{
                          color: stored?.id === entry.id ? "var(--text-primary)" : "var(--text-secondary)",
                          background: stored?.id === entry.id ? "var(--bg-hover)" : "transparent",
                        }}
                      >
                        <span className="truncate">{entry.title}</span>
                      </button>
                      <div className="md:hidden absolute right-1 top-1/2 -translate-y-1/2">
                        <AssetMenuButton asset={{ type: "story", id: entry.id }} label={entry.title} />
                      </div>
                      <div className="max-md:hidden absolute right-2 top-1/2 -translate-y-1/2 flex">
                        <AssetPinButton asset={{ type: "story", id: entry.id }} label={entry.title} />
                      </div>
                    </div>
                  ))}
              </div>
            );
          })}
        </div>
        <div className="px-3 py-2.5 border-t" style={{ borderColor: "var(--border)" }}>
          <ExamplesBar projectId={projectId} collections={["stories"]} />
        </div>
      </div>

      {/* Editor */}
      {selected ? (
        <div className={`flex-1 flex flex-col min-w-0 ${mobileView === "list" ? "max-md:hidden" : ""}`}>
          {/* Header */}
          <div className="flex items-center justify-between gap-2 px-5 max-md:px-3 py-3 border-b max-md:flex-wrap" style={{ borderColor: "var(--border)" }}>
            <div className="flex items-center gap-2 min-w-0 max-md:flex-1">
              <button
                onClick={() => {
                  flushDraft();
                  setMobileView("list");
                }}
                className="md:hidden p-1.5 rounded-md shrink-0"
                style={{ color: "var(--text-primary)", border: "1px solid var(--border)" }}
                title="Back to all entries"
                aria-label="Back to all entries"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <UndoRedoButtons history={history} />
              {(() => {
                const meta = getTypeMeta(selected.type);
                return (
                  <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0" style={{ background: `${meta.color}20`, color: meta.color }}>
                    <meta.icon className="w-4 h-4" />
                  </div>
                );
              })()}
              <input
                type="text"
                value={selected.title}
                onChange={(e) => saveEntry({ title: e.target.value })}
                className="text-lg font-semibold bg-transparent outline-none min-w-0 max-md:flex-1"
                aria-label="Entry title"
                style={{ color: "var(--text-primary)" }}
              />
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <SaveIndicator state={autosave.state} className="mr-1" />
              <select
                value={selected.type}
                aria-label="Entry type"
                onChange={(e) => saveEntry({ type: e.target.value as EntryType })}
                className="px-2 py-1 rounded-md text-xs outline-none"
                style={{ background: "var(--bg-card)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
              >
                {ENTRY_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              <button onClick={() => deleteEntry(selected.id)} className="p-1.5 rounded-md" style={{ color: "var(--red)", border: "1px solid var(--border)" }} title="Delete entry" aria-label="Delete entry">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              <HelpButton topic="story" className="md:hidden" />
            </div>
          </div>

          {/* Tags */}
          <div className="flex items-center gap-1.5 px-5 max-md:px-3 py-2 border-b flex-wrap" style={{ borderColor: "var(--border)" }}>
            <Tag className="w-3 h-3 shrink-0" style={{ color: "var(--text-muted)" }} />
            {selected.tags.map((tag) => (
              <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px]" style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}>
                {tag}
                <button onClick={() => removeTag(tag)} className="hover:opacity-70" title={`Remove tag ${tag}`} aria-label={`Remove tag ${tag}`}>
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            ))}
            <input
              type="text"
              placeholder="Add tag…"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addTag()}
              className="bg-transparent outline-none text-[11px] w-20"
              style={{ color: "var(--text-secondary)" }}
            />
          </div>

          {/* Phones: switch between writing and reading */}
          <div className="md:hidden flex border-b" style={{ borderColor: "var(--border)" }} role="tablist">
            {(["edit", "preview"] as const).map((pane) => (
              <button
                key={pane}
                role="tab"
                aria-selected={mobilePane === pane}
                onClick={() => {
                  if (pane === "preview") flushDraft();
                  setMobilePane(pane);
                }}
                className="flex-1 py-2 text-xs font-medium"
                style={{
                  color: mobilePane === pane ? "var(--text-primary)" : "var(--text-muted)",
                  borderBottom: `2px solid ${mobilePane === pane ? "var(--tool-color, var(--accent))" : "transparent"}`,
                }}
              >
                {pane === "edit" ? "Write" : "Read"}
              </button>
            ))}
          </div>

          {/* Content area - side by side edit / preview */}
          <div className="flex-1 flex min-h-0">
            <div
              className={`flex-1 flex flex-col border-r max-md:border-r-0 relative min-w-0 ${mobilePane === "preview" ? "max-md:hidden" : ""}`}
              style={{ borderColor: "var(--border)" }}
            >
              <div className="px-5 py-1.5 text-[10px] font-medium flex items-center justify-between max-md:hidden" style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}>
                <span>EDIT (Markdown — type [[ to link an entry)</span>
              </div>
              <textarea
                ref={textareaRef}
                value={selected.content}
                onChange={(e) => {
                  setDraft({ id: selected.id, content: e.target.value });
                  updateAutocomplete(e.target.value, e.target.selectionStart);
                }}
                onKeyDown={onEditorKeyDown}
                onClick={(e) => updateAutocomplete(e.currentTarget.value, e.currentTarget.selectionStart)}
                onBlur={() => {
                  setTimeout(() => setAc(null), 150);
                  flushDraft();
                }}
                className="flex-1 resize-none p-5 max-md:p-4 text-sm leading-relaxed outline-none font-mono"
                style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}
                placeholder="Write your entry content here. Type [[ to link to other entries…"
              />
              {ac && (
                <div
                  className="absolute left-5 right-5 bottom-4 z-20 rounded-lg shadow-xl py-1 max-h-60 overflow-y-auto"
                  style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
                >
                  <div className="px-3 py-1 text-[10px] flex items-center justify-between" style={{ color: "var(--text-muted)" }}>
                    <span>Link to entry{ac.query ? ` matching “${ac.query}”` : ""}</span>
                    <span className="flex items-center gap-1">
                      <CornerDownLeft className="w-3 h-3" /> insert
                    </span>
                  </div>
                  {acOptions.length === 0 ? (
                    <div className="px-3 py-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
                      No match — finish with ]] and click it in the preview to create it.
                    </div>
                  ) : (
                    acOptions.map((opt, i) => {
                      const meta = getTypeMeta(opt.type);
                      return (
                        <button
                          key={opt.id}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            insertLink(opt.title);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left"
                          style={{ background: i === ac.index ? "var(--bg-hover)" : "transparent", color: "var(--text-primary)" }}
                        >
                          <meta.icon className="w-3 h-3" style={{ color: meta.color }} />
                          <span className="truncate">{opt.title}</span>
                          <span className="ml-auto" style={{ color: "var(--text-muted)" }}>
                            {meta.label}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>
            <div className={`flex-1 flex flex-col min-w-0 ${mobilePane === "edit" ? "max-md:hidden" : ""}`}>
              <div className="px-5 py-1.5 text-[10px] font-medium max-md:hidden" style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}>
                PREVIEW
              </div>
              <div className="flex-1 overflow-y-auto">
                <div className="p-5 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  {selected.content.split("\n").map((line, i) => renderLine(line, String(i)))}
                </div>
                <div className="px-5 py-4 border-t space-y-4" style={{ borderColor: "var(--border)" }}>
                  <LinkedAssets projectId={projectId} type="story" id={selected.id} layout="panel" />
                  {backlinks.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                        Mentioned in
                      </div>
                      {backlinks.map(({ entry, context }) => {
                        const meta = getTypeMeta(entry.type);
                        return (
                          <button
                            key={entry.id}
                            {...assetTriggerProps({ type: "story", id: entry.id })}
                            onClick={() => selectEntry(entry.id)}
                            className="w-full text-left px-2.5 py-1.5 rounded-md text-xs hover:bg-[var(--bg-hover)]"
                            style={{ border: "1px solid var(--border)" }}
                          >
                            <span className="flex items-center gap-1.5 font-medium" style={{ color: meta.color }}>
                              <meta.icon className="w-3 h-3" />
                              {entry.title}
                            </span>
                            {context && (
                              <span className="block mt-0.5 truncate" style={{ color: "var(--text-muted)" }}>
                                {context}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center max-md:hidden" style={{ color: "var(--text-muted)" }}>
          <div className="text-center">
            <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Select an entry or create a new one</p>
          </div>
        </div>
      )}

      {/* Wiki link hover card */}
      {hover && hoverEntry && (
        <div
          className="fixed z-50 w-72 rounded-lg shadow-xl p-3 pointer-events-none"
          style={{ left: Math.min(hover.x, (typeof window !== "undefined" ? window.innerWidth : 1200) - 300), top: hover.y, background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
        >
          {(() => {
            const meta = getTypeMeta(hoverEntry.type);
            const excerpt = hoverEntry.content.replace(/\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g, (_, t, a) => a || t).replace(/[#*_>`]/g, "").replace(/\s+/g, " ").trim();
            return (
              <div className="flex gap-3">
                {hoverSprite?.thumbnail && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={hoverSprite.thumbnail} alt="" className="w-12 h-12 shrink-0 rounded" style={{ imageRendering: "pixelated", background: "var(--bg-primary)" }} />
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                    <meta.icon className="w-3.5 h-3.5 shrink-0" style={{ color: meta.color }} />
                    <span className="truncate">{hoverEntry.title}</span>
                  </div>
                  <div className="text-[10px] mb-1" style={{ color: meta.color }}>
                    {meta.label}
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                    {excerpt ? (excerpt.length > 160 ? excerpt.slice(0, 160) + "…" : excerpt) : "No content yet."}
                  </p>
                  {hoverRelated.filter((r) => r.type !== "story").length > 0 && (
                    <p className="text-[10px] mt-1.5" style={{ color: "var(--text-muted)" }}>
                      Linked: {hoverRelated.filter((r) => r.type !== "story").map((r) => r.name).join(", ")}
                    </p>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
