"use client";

import { ClipboardPaste, Copy, CopyPlus, FlipHorizontal2, RotateCw, Scissors, Trash2, X } from "lucide-react";
import { boxSize, type Axis } from "@/lib/voxels/selection";
import type { Vec3 } from "@/lib/voxels/grid";
import type { VoxelSelection } from "./useVoxelSelection";

const AXES: { axis: Axis; label: string }[] = [
  { axis: 0, label: "X" },
  { axis: 1, label: "Y" },
  { axis: 2, label: "Z" },
];

const MOVES: { delta: Vec3; label: string; title: string }[] = [
  { delta: [-1, 0, 0], label: "←", title: "Move left (←)" },
  { delta: [1, 0, 0], label: "→", title: "Move right (→)" },
  { delta: [0, 1, 0], label: "Up", title: "Move up (Page Up)" },
  { delta: [0, -1, 0], label: "Down", title: "Move down (Page Down)" },
  { delta: [0, 0, -1], label: "Back", title: "Move back (↑ in 3D)" },
  { delta: [0, 0, 1], label: "Fwd", title: "Move forward (↓ in 3D)" },
];

const btn = "flex items-center gap-1 px-1.5 py-1 rounded-md text-xs shrink-0 disabled:opacity-30";
const btnStyle: React.CSSProperties = { color: "var(--text-primary)", border: "1px solid var(--border)" };

function Divider(): React.JSX.Element {
  return <div className="w-px h-5 shrink-0" style={{ background: "var(--border)" }} />;
}

/** Actions for the selected cubes: move, rotate, flip and the clipboard. */
export function SelectionBar({ selection }: { selection: VoxelSelection }): React.JSX.Element | null {
  const { box } = selection;
  if (!box && !selection.hasClipboard && !selection.message) return null;
  const dims = box ? boxSize(box) : null;
  return (
    <div
      className="flex items-center gap-1.5 px-3 py-1.5 border-b shrink-0 max-md:overflow-x-auto md:flex-wrap"
      style={{ borderColor: "var(--border)", background: "color-mix(in srgb, #4dd0ff 8%, var(--bg-secondary))" }}
      role="toolbar"
      aria-label="Selection"
    >
      {box && dims ? (
        <>
          <span className="text-xs font-medium tabular-nums shrink-0" style={{ color: "var(--text-primary)" }}>
            {dims[0]}×{dims[1]}×{dims[2]} selected
          </span>
          <Divider />
          {MOVES.map(({ delta, label, title }) => (
            <button key={title} onClick={() => selection.move(delta)} className={btn} style={btnStyle} title={title} aria-label={title}>
              {label}
            </button>
          ))}
          <Divider />
          {AXES.map(({ axis, label }) => (
            <button key={`r${axis}`} onClick={() => selection.rotate(axis)} className={btn} style={btnStyle} title={`Rotate 90° around ${label}`} aria-label={`Rotate around ${label}`}>
              <RotateCw className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
          {AXES.map(({ axis, label }) => (
            <button key={`f${axis}`} onClick={() => selection.flip(axis)} className={btn} style={btnStyle} title={`Flip along ${label}`} aria-label={`Flip along ${label}`}>
              <FlipHorizontal2 className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
          <Divider />
          <button onClick={selection.copy} className={btn} style={btnStyle} title="Copy (Ctrl/⌘+C)" aria-label="Copy">
            <Copy className="w-3.5 h-3.5" /> Copy
          </button>
          <button onClick={selection.cut} className={btn} style={btnStyle} title="Cut (Ctrl/⌘+X)" aria-label="Cut">
            <Scissors className="w-3.5 h-3.5" /> Cut
          </button>
        </>
      ) : null}
      <button onClick={selection.paste} disabled={!selection.hasClipboard} className={btn} style={btnStyle} title="Paste (Ctrl/⌘+V)" aria-label="Paste">
        <ClipboardPaste className="w-3.5 h-3.5" /> Paste
      </button>
      {box && (
        <>
          <button onClick={selection.duplicate} className={btn} style={btnStyle} title="Duplicate (Ctrl/⌘+D): move the copy with the arrow keys" aria-label="Duplicate">
            <CopyPlus className="w-3.5 h-3.5" /> Duplicate
          </button>
          <button onClick={selection.remove} className={btn} style={{ ...btnStyle, color: "var(--red)" }} title="Delete the selected cubes (Delete)" aria-label="Delete selected cubes">
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
          <button onClick={selection.deselect} className={btn} style={btnStyle} title="Deselect (Esc)" aria-label="Deselect">
            <X className="w-3.5 h-3.5" />
          </button>
        </>
      )}
      {selection.message && (
        <span className="text-xs shrink-0 ml-1" role="status" style={{ color: "var(--text-secondary)" }}>
          {selection.message}
        </span>
      )}
    </div>
  );
}
