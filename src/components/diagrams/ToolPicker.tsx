"use client";

import { Link2, MousePointer, PenLine, SquareDashedMousePointer, type LucideIcon } from "lucide-react";

export type BoardTool = "select" | "area" | "draw" | "connect";

const TOOLS: { tool: BoardTool; icon: LucideIcon; label: string; title: string }[] = [
  { tool: "select", icon: MousePointer, label: "Select and move", title: "Select & move: drag empty space to pan, Shift+drag to box-select (Esc)" },
  { tool: "area", icon: SquareDashedMousePointer, label: "Box select", title: "Box select: drag around cards, tap cards to add or remove them" },
  { tool: "draw", icon: PenLine, label: "Draw", title: "Draw: sketch freehand lines on the board" },
  { tool: "connect", icon: Link2, label: "Connect cards", title: "Connect cards: click the first card, then the second" },
];

/** The board's tool buttons: one is always active. */
export function ToolPicker({ tool, onChange }: { tool: BoardTool; onChange(tool: BoardTool): void }) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Board tools">
      {TOOLS.map(({ tool: value, icon: Icon, label, title }) => {
        const isActive = tool === value;
        return (
          <button
            key={value}
            onClick={() => onChange(value)}
            className="p-1.5 rounded text-xs max-md:p-2"
            style={{
              background: isActive ? "var(--bg-hover)" : "transparent",
              color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
            }}
            title={title}
            aria-label={label}
            aria-pressed={isActive}
          >
            <Icon className="w-4 h-4" />
          </button>
        );
      })}
    </div>
  );
}
