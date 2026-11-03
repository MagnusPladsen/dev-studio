"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import type { LibrarySection, ShapeDefinition } from "@/lib/canvas-shapes";
import { shapesInSection } from "@/lib/canvas-shapes/library";
import type { NodeType } from "@/lib/diagrams/cards";

const SECTIONS: { section: LibrarySection; title: string }[] = [
  { section: "board", title: "Board cards" },
  { section: "shapes", title: "Shapes" },
  { section: "flow", title: "Flow chart" },
];

function MenuItem({ shape, onPick }: { shape: ShapeDefinition; onPick(type: NodeType): void }) {
  const Icon = shape.icon;
  const hint = shape.library?.hint;
  return (
    <button
      role="menuitem"
      onClick={() => onPick(shape.type)}
      className="flex items-start gap-2.5 w-full px-3 py-1.5 text-sm text-left hover:bg-[var(--bg-hover)]"
      style={{ color: "var(--text-primary)" }}
    >
      <Icon className="w-4 h-4 mt-0.5 shrink-0" style={{ color: shape.library?.section === "flow" ? shape.color : "var(--accent)" }} />
      <span className="min-w-0">
        {shape.label}
        {hint && <span className="block text-[11px] leading-4" style={{ color: "var(--text-muted)" }}>{hint}</span>}
      </span>
    </button>
  );
}

/** The toolbar's "Add" dropdown: board cards first, then basic shapes, then flow-chart shapes. */
export function AddCardMenu({ onPick }: { onPick(type: NodeType): void }) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const close = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setIsOpen(false);
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [isOpen]);

  const pick = (type: NodeType) => {
    setIsOpen(false);
    onPick(type);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 px-2 py-1 rounded text-xs"
        style={{ background: "var(--bg-card)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        <Plus className="w-3.5 h-3.5" />
        Add
        <ChevronDown className="w-3 h-3" />
      </button>
      {isOpen && (
        <div
          role="menu"
          className="absolute top-full mt-1 py-1 rounded-lg border z-30 w-60 max-h-[70vh] overflow-y-auto right-0 md:left-0 md:right-auto"
          style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
        >
          {SECTIONS.map(({ section, title }, index) => (
            <div key={section}>
              {index > 0 && <div className="my-1 h-px" style={{ background: "var(--border)" }} />}
              <p className="px-3 pt-1 pb-0.5 text-[11px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{title}</p>
              {shapesInSection(section).map((shape) => <MenuItem key={shape.type} shape={shape} onPick={pick} />)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
