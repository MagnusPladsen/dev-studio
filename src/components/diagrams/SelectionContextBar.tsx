"use client";

import { BringToFront, Copy, Link2, Trash2 } from "lucide-react";
import type { Point, Rect } from "@/lib/diagrams/geometry";

interface SelectionContextBarProps {
  /** The selection's bounds in board coordinates. */
  bounds: Rect;
  pan: Point;
  zoom: number;
  /** Connect starts a line from the card, so it only shows for a single card. */
  canConnect: boolean;
  onDuplicate(): void;
  onConnect(): void;
  onBringToFront(): void;
  onDelete(): void;
}

const BAR_HEIGHT = 36;
const GAP = 10;
const BUTTON = "p-1.5 rounded hover:bg-[var(--bg-hover)] max-md:p-2";

/** A small bar just above the selected cards with the actions people reach for most. */
export function SelectionContextBar({ bounds, pan, zoom, canConnect, ...actions }: SelectionContextBarProps) {
  const top = pan.y + bounds.y * zoom - BAR_HEIGHT - GAP;
  const below = pan.y + (bounds.y + bounds.height) * zoom + GAP;
  const left = pan.x + (bounds.x + bounds.width / 2) * zoom;
  return (
    <div
      data-card-control=""
      role="toolbar"
      aria-label="Selection actions"
      className="absolute z-10 flex items-center gap-0.5 px-1 rounded-lg border shadow-lg -translate-x-1/2"
      style={{ left, top: top < GAP ? below : top, height: BAR_HEIGHT, background: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      <button onClick={actions.onDuplicate} className={BUTTON} style={{ color: "var(--text-primary)" }} title="Duplicate (Ctrl/⌘+D)" aria-label="Duplicate">
        <Copy className="w-4 h-4" />
      </button>
      {canConnect && (
        <button onClick={actions.onConnect} className={BUTTON} style={{ color: "var(--text-primary)" }} title="Connect to another card" aria-label="Connect to another card">
          <Link2 className="w-4 h-4" />
        </button>
      )}
      <button onClick={actions.onBringToFront} className={BUTTON} style={{ color: "var(--text-primary)" }} title="Bring to front" aria-label="Bring to front">
        <BringToFront className="w-4 h-4" />
      </button>
      <button onClick={actions.onDelete} className={BUTTON} style={{ color: "var(--red)" }} title="Delete (Del)" aria-label="Delete">
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}
