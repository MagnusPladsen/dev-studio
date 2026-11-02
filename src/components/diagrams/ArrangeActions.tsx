"use client";

import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  BringToFront,
  CopyPlus,
  SendToBack,
  type LucideIcon,
} from "lucide-react";
import type { Alignment, Axis } from "@/lib/diagrams/arrange";

export interface ArrangeHandlers {
  onDuplicate(): void;
  onArrange(direction: "front" | "back"): void;
  onAlign(edge: Alignment): void;
  onDistribute(axis: Axis): void;
}

const ALIGNMENTS: { edge: Alignment; icon: LucideIcon; label: string }[] = [
  { edge: "left", icon: AlignStartVertical, label: "Align left" },
  { edge: "center", icon: AlignCenterVertical, label: "Align centre" },
  { edge: "right", icon: AlignEndVertical, label: "Align right" },
  { edge: "top", icon: AlignStartHorizontal, label: "Align top" },
  { edge: "middle", icon: AlignCenterHorizontal, label: "Align middle" },
  { edge: "bottom", icon: AlignEndHorizontal, label: "Align bottom" },
];

function IconButton({ icon: Icon, label, onClick, disabled }: { icon: LucideIcon; label: string; onClick(): void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="p-1.5 rounded disabled:opacity-40 max-md:p-2"
      style={{ background: "var(--bg-primary)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
      title={label}
      aria-label={label}
    >
      <Icon className="w-3.5 h-3.5" />
    </button>
  );
}

/** Duplicate and stacking order for any selection; align and distribute once two or more cards are selected. */
export function ArrangeActions({ count, onDuplicate, onArrange, onAlign, onDistribute }: ArrangeHandlers & { count: number }) {
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1" role="group" aria-label="Arrange">
        <IconButton icon={CopyPlus} label="Duplicate (Ctrl/⌘+D)" onClick={onDuplicate} />
        <IconButton icon={BringToFront} label="Bring to front" onClick={() => onArrange("front")} />
        <IconButton icon={SendToBack} label="Send to back" onClick={() => onArrange("back")} />
      </div>
      {count > 1 && (
        <div className="flex flex-wrap gap-1" role="group" aria-label="Align and distribute">
          {ALIGNMENTS.map(({ edge, icon, label }) => (
            <IconButton key={edge} icon={icon} label={label} onClick={() => onAlign(edge)} />
          ))}
          <IconButton icon={AlignHorizontalDistributeCenter} label="Distribute horizontally" onClick={() => onDistribute("horizontal")} disabled={count < 3} />
          <IconButton icon={AlignVerticalDistributeCenter} label="Distribute vertically" onClick={() => onDistribute("vertical")} disabled={count < 3} />
        </div>
      )}
    </div>
  );
}
