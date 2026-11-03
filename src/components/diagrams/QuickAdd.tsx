"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { searchShapes } from "@/lib/canvas-shapes/library";
import type { NodeType } from "@/lib/diagrams/cards";

interface QuickAddProps {
  onPick(type: NodeType): void;
  onClose(): void;
}

/** The "/" search on the board: type to filter shapes, arrows to move, Enter to add at the pointer. */
export function QuickAdd({ onPick, onClose }: QuickAddProps) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const results = searchShapes(query);
  const activeIndex = Math.min(active, results.length - 1);

  function handleKeyDown(e: React.KeyboardEvent) {
    e.stopPropagation();
    if (e.key === "Escape") return onClose();
    if (e.key === "Enter" && results[activeIndex]) return onPick(results[activeIndex].type);
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const step = e.key === "ArrowDown" ? 1 : -1;
    setActive((activeIndex + step + results.length) % Math.max(1, results.length));
  }

  return (
    <div
      data-card-control=""
      role="dialog"
      aria-label="Quick add"
      className="absolute top-3 left-1/2 -translate-x-1/2 z-20 w-72 max-w-[calc(100%-24px)] rounded-xl border shadow-xl overflow-hidden"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b" style={{ borderColor: "var(--border)" }}>
        <Search className="w-4 h-4 shrink-0" style={{ color: "var(--text-muted)" }} />
        <input
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={handleKeyDown}
          onBlur={onClose}
          placeholder="Add a shape…"
          aria-label="Search shapes to add"
          aria-controls="quick-add-results"
          aria-activedescendant={results[activeIndex] ? `quick-add-${results[activeIndex].type}` : undefined}
          className="flex-1 min-w-0 bg-transparent text-sm outline-none max-md:text-base"
          style={{ color: "var(--text-primary)" }}
        />
      </div>
      <ul id="quick-add-results" role="listbox" aria-label="Shapes" className="max-h-64 overflow-y-auto py-1">
        {results.map((shape, index) => {
          const Icon = shape.icon;
          return (
            <li
              key={shape.type}
              id={`quick-add-${shape.type}`}
              role="option"
              aria-selected={index === activeIndex}
              // Keep focus in the input, so its blur doesn't close the list before the click lands.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onPick(shape.type)}
              onPointerEnter={() => setActive(index)}
              className="flex items-center gap-2.5 px-3 py-1.5 text-sm"
              style={{ color: "var(--text-primary)", background: index === activeIndex ? "var(--bg-hover)" : undefined }}
            >
              <Icon className="w-4 h-4 shrink-0" style={{ color: shape.library?.section === "flow" ? shape.color : "var(--accent)" }} />
              <span className="min-w-0 truncate">{shape.label}</span>
              {shape.library?.hint && <span className="ml-auto text-[11px] truncate" style={{ color: "var(--text-muted)" }}>{shape.library.hint}</span>}
            </li>
          );
        })}
        {!results.length && <li className="px-3 py-3 text-xs text-center" style={{ color: "var(--text-muted)" }}>No shapes match</li>}
      </ul>
    </div>
  );
}
