"use client";

import { useEffect, useRef, useState } from "react";
import {
  Boxes,
  ChevronDown,
  Circle,
  Diamond,
  Hexagon,
  Image as ImageIcon,
  Link2,
  ListChecks,
  Plus,
  RectangleHorizontal,
  Square,
  SquareDashed,
  StickyNote,
  type LucideIcon,
} from "lucide-react";
import { BASIC_SHAPES, BOARD_CARDS, FLOW_SHAPES, NODE_LABELS, SHAPE_COLORS, type NodeType } from "@/lib/diagrams/cards";

const ICONS: Partial<Record<NodeType, LucideIcon>> = {
  note: StickyNote,
  checklist: ListChecks,
  image: ImageIcon,
  link: Link2,
  asset: Boxes,
  group: SquareDashed,
  state: Circle,
  action: Square,
  condition: Diamond,
  event: Hexagon,
  rectangle: RectangleHorizontal,
  ellipse: Circle,
  diamond: Diamond,
};

const HINTS: Partial<Record<NodeType, string>> = {
  note: "Text that wraps and grows",
  checklist: "Tasks you can tick off",
  image: "Upload, paste or drop a picture",
  link: "YouTube, Spotify or any website",
  asset: "Any sprite, sound, story… in this project",
  group: "An area that holds cards",
  rectangle: "Box with text, any size",
  ellipse: "Circle or oval with text",
  diamond: "Diamond with text",
};

function MenuItem({ type, onPick }: { type: NodeType; onPick(type: NodeType): void }) {
  const Icon = ICONS[type] ?? Square;
  const isShape = FLOW_SHAPES.includes(type);
  return (
    <button
      role="menuitem"
      onClick={() => onPick(type)}
      className="flex items-start gap-2.5 w-full px-3 py-1.5 text-sm text-left hover:bg-[var(--bg-hover)]"
      style={{ color: "var(--text-primary)" }}
    >
      <Icon className="w-4 h-4 mt-0.5 shrink-0" style={{ color: isShape ? SHAPE_COLORS[type] : "var(--accent)" }} />
      <span className="min-w-0">
        {NODE_LABELS[type]}
        {HINTS[type] && <span className="block text-[11px] leading-4" style={{ color: "var(--text-muted)" }}>{HINTS[type]}</span>}
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
          <p className="px-3 pt-1 pb-0.5 text-[11px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Board cards</p>
          {BOARD_CARDS.map((type) => <MenuItem key={type} type={type} onPick={pick} />)}
          <div className="my-1 h-px" style={{ background: "var(--border)" }} />
          <p className="px-3 pt-1 pb-0.5 text-[11px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Shapes</p>
          {BASIC_SHAPES.map((type) => <MenuItem key={type} type={type} onPick={pick} />)}
          <div className="my-1 h-px" style={{ background: "var(--border)" }} />
          <p className="px-3 pt-1 pb-0.5 text-[11px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Flow chart</p>
          {FLOW_SHAPES.map((type) => <MenuItem key={type} type={type} onPick={pick} />)}
        </div>
      )}
    </div>
  );
}
