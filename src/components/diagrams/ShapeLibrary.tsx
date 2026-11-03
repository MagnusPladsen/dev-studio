"use client";

import { useState } from "react";
import { PanelLeftClose, Search, Shapes, X } from "lucide-react";
import type { ShapeDefinition } from "@/lib/canvas-shapes";
import { libraryTabs, searchShapes, shapesInSection, SHAPE_DRAG_TYPE } from "@/lib/canvas-shapes/library";
import type { NodeType } from "@/lib/diagrams/cards";

const OPEN_KEY = "gds-canvas-shape-library";

/** Below Tailwind's `md` breakpoint the library is a bottom sheet over the board instead of a column. */
export function isPhoneLayout(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
}

function readOpen(): boolean {
  if (typeof window === "undefined" || isPhoneLayout()) return false;
  try {
    return localStorage.getItem(OPEN_KEY) !== "closed";
  } catch {
    return true;
  }
}

/** Open by default beside the board on desktop, remembered per browser; closed on phones until asked for. */
export function useShapeLibraryOpen(): [boolean, (isOpen: boolean) => void] {
  const [isOpen, setIsOpen] = useState(readOpen);
  const update = (next: boolean) => {
    setIsOpen(next);
    if (isPhoneLayout()) return;
    try {
      localStorage.setItem(OPEN_KEY, next ? "open" : "closed");
    } catch {
      // Private mode or blocked storage: the choice just isn't remembered.
    }
  };
  return [isOpen, update];
}

/** Brings the library back when it is hidden; sits in the board's top-left corner. */
export function ShapeLibraryToggle({ onOpen }: { onOpen(): void }) {
  return (
    <button
      data-card-control=""
      onClick={onOpen}
      className="absolute top-3 left-3 z-10 flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs max-md:px-3 max-md:py-2"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text-primary)" }}
      title="Show shapes"
      aria-label="Show shapes"
    >
      <Shapes className="w-4 h-4" style={{ color: "var(--accent)" }} />
      Shapes
    </button>
  );
}

interface ShapeLibraryProps {
  onPick(type: NodeType): void;
  onClose(): void;
}

function ShapeTile({ shape, onPick }: { shape: ShapeDefinition; onPick(type: NodeType): void }) {
  const Icon = shape.icon;
  const isFlow = shape.library?.section === "flow";
  return (
    <button
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(SHAPE_DRAG_TYPE, shape.type);
        e.dataTransfer.effectAllowed = "copy";
      }}
      onClick={() => onPick(shape.type)}
      className="flex flex-col items-center justify-center gap-1 p-2 rounded-lg text-[11px] leading-tight text-center hover:bg-[var(--bg-hover)] max-md:py-3"
      style={{ color: "var(--text-primary)", border: "1px solid var(--border)", background: "var(--bg-card)" }}
      title={shape.library?.hint ? `${shape.label}: ${shape.library.hint}` : shape.label}
      aria-label={`Add ${shape.label}`}
    >
      <Icon className="w-5 h-5" style={{ color: isFlow ? shape.color : "var(--accent)" }} />
      <span className="w-full truncate">{shape.label}</span>
    </button>
  );
}

function TileGrid({ shapes, onPick }: { shapes: ShapeDefinition[]; onPick(type: NodeType): void }) {
  return (
    <div className="grid grid-cols-2 gap-1.5 max-md:grid-cols-4">
      {shapes.map((shape) => <ShapeTile key={shape.type} shape={shape} onPick={onPick} />)}
    </div>
  );
}

/**
 * The board's shape library: tabs of shapes, a search box, and click or drag to place.
 * A column left of the board on desktop, a bottom sheet on phones.
 */
export function ShapeLibrary({ onPick, onClose }: ShapeLibraryProps) {
  const tabs = libraryTabs();
  const [tabId, setTabId] = useState(tabs[0]?.id);
  const [query, setQuery] = useState("");
  const tab = tabs.find((t) => t.id === tabId) ?? tabs[0];
  const results = query.trim() ? searchShapes(query) : null;

  return (
    <aside
      aria-label="Shape library"
      className="w-56 shrink-0 flex flex-col border-r min-h-0 max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-40 max-md:w-auto max-md:max-h-[55vh] max-md:border-r-0 max-md:border-t max-md:rounded-t-2xl max-md:shadow-2xl"
      style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}
    >
      <div className="flex items-center justify-between gap-2 px-3 pt-2.5 pb-1.5">
        <span className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>Shapes</span>
        <button onClick={onClose} className="p-1 rounded max-md:p-2" style={{ color: "var(--text-secondary)" }} title="Hide shapes" aria-label="Hide shapes">
          <PanelLeftClose className="w-4 h-4 max-md:hidden" />
          <X className="w-4 h-4 md:hidden" />
        </button>
      </div>
      <div className="px-3 pb-2">
        <div className="flex items-center gap-1.5 px-2 py-1 rounded" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}>
          <Search className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--text-muted)" }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setQuery("");
              if (e.key === "Enter" && results?.[0]) onPick(results[0].type);
            }}
            placeholder="Search shapes"
            aria-label="Search shapes"
            className="flex-1 min-w-0 bg-transparent text-xs outline-none max-md:text-base"
            style={{ color: "var(--text-primary)" }}
          />
        </div>
      </div>
      {!results && tabs.length > 1 && (
        <div className="flex gap-1 px-3 pb-2" role="tablist" aria-label="Shape groups">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={t.id === tab.id}
              onClick={() => setTabId(t.id)}
              className="px-2 py-1 rounded text-xs max-md:px-3 max-md:py-1.5"
              style={{
                background: t.id === tab.id ? "var(--bg-hover)" : "transparent",
                color: t.id === tab.id ? "var(--text-primary)" : "var(--text-secondary)",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3 space-y-3">
        {results ? (
          results.length ? (
            <TileGrid shapes={results} onPick={onPick} />
          ) : (
            <p className="text-xs py-4 text-center" style={{ color: "var(--text-muted)" }}>No shapes match “{query.trim()}”</p>
          )
        ) : (
          tab.sections.map(({ section, title }) => (
            <section key={section} aria-label={title}>
              <p className="pb-1 text-[11px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{title}</p>
              <TileGrid shapes={shapesInSection(section)} onPick={onPick} />
            </section>
          ))
        )}
        <p className="text-[11px] leading-4 max-md:hidden" style={{ color: "var(--text-muted)" }}>
          Click to add in the middle, or drag onto the board. Press <kbd>/</kbd> on the board to search.
        </p>
      </div>
    </aside>
  );
}
