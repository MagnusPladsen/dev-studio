"use client";

import { Box, Eraser, Hand, PaintBucket, Paintbrush, Pipette, Plus, RotateCcw } from "lucide-react";
import { GRID_SIZES } from "@/lib/voxels/grid";
import type { Symmetry } from "@/lib/voxels/edit";
import type { ViewPreset, VoxelTool } from "./types";

export const TOOL_META: Record<VoxelTool, { icon: typeof Plus; label: string; key: string }> = {
  add: { icon: Plus, label: "Add", key: "B" },
  erase: { icon: Eraser, label: "Erase", key: "E" },
  paint: { icon: Paintbrush, label: "Paint", key: "P" },
  pick: { icon: Pipette, label: "Colour picker", key: "I" },
  fill: { icon: PaintBucket, label: "Fill face", key: "G" },
  box: { icon: Box, label: "Box", key: "R" },
};

const TOOLS = Object.keys(TOOL_META) as VoxelTool[];
const AXES: (keyof Symmetry)[] = ["x", "y", "z"];
const VIEWS: { preset: ViewPreset; label: string }[] = [
  { preset: "front", label: "Front" },
  { preset: "side", label: "Side" },
  { preset: "top", label: "Top" },
];

interface Props {
  tool: VoxelTool;
  onToolChange(tool: VoxelTool): void;
  isBoxErase: boolean;
  onBoxEraseChange(isErase: boolean): void;
  symmetry: Symmetry;
  onSymmetryChange(symmetry: Symmetry): void;
  onView(preset: ViewPreset): void;
  size: number;
  onSizeChange(size: number): void;
  oneFingerOrbit: boolean;
  onOneFingerOrbitChange(isOn: boolean): void;
}

function toggleStyle(isActive: boolean): React.CSSProperties {
  return {
    background: isActive ? "var(--accent)" : "transparent",
    color: isActive ? "var(--on-accent, #fff)" : "var(--text-primary)",
    border: `1px solid ${isActive ? "var(--accent)" : "var(--border)"}`,
  };
}

function Divider(): React.JSX.Element {
  return <div className="w-px h-5 shrink-0" style={{ background: "var(--border)" }} />;
}

function Label({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <span className="text-[10px] uppercase tracking-wider shrink-0" style={{ color: "var(--text-muted)" }}>
      {children}
    </span>
  );
}

function ToolButtons({ tool, onToolChange }: Pick<Props, "tool" | "onToolChange">): React.JSX.Element {
  return (
    <div className="flex items-center gap-1 shrink-0">
      {TOOLS.map((id) => {
        const { icon: Icon, label, key } = TOOL_META[id];
        return (
          <button
            key={id}
            onClick={() => onToolChange(id)}
            className="p-1.5 rounded-md max-md:p-2"
            style={toggleStyle(tool === id)}
            title={`${label} (${key})`}
            aria-label={`${label} (${key})`}
            aria-pressed={tool === id}
          >
            <Icon className="w-4 h-4" />
          </button>
        );
      })}
    </div>
  );
}

function BoxModeButtons({ isBoxErase, onBoxEraseChange }: Pick<Props, "isBoxErase" | "onBoxEraseChange">): React.JSX.Element {
  return (
    <div className="flex items-center gap-1 shrink-0" title="Hold Shift while dragging to switch">
      {[false, true].map((isErase) => (
        <button
          key={String(isErase)}
          onClick={() => onBoxEraseChange(isErase)}
          className="px-2 py-1 rounded-md text-xs"
          style={toggleStyle(isBoxErase === isErase)}
          aria-pressed={isBoxErase === isErase}
        >
          {isErase ? "Erase box" : "Add box"}
        </button>
      ))}
    </div>
  );
}

function MirrorButtons({ symmetry, onSymmetryChange }: Pick<Props, "symmetry" | "onSymmetryChange">): React.JSX.Element {
  return (
    <div className="flex items-center gap-1 shrink-0">
      <Label>Mirror</Label>
      {AXES.map((axis) => (
        <button
          key={axis}
          onClick={() => onSymmetryChange({ ...symmetry, [axis]: !symmetry[axis] })}
          className="w-7 h-7 rounded-md text-xs font-medium"
          style={toggleStyle(symmetry[axis])}
          title={`Mirror edits across the ${axis.toUpperCase()} axis`}
          aria-label={`Mirror ${axis.toUpperCase()}`}
          aria-pressed={symmetry[axis]}
        >
          {axis.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

function ViewButtons({ onView }: Pick<Props, "onView">): React.JSX.Element {
  return (
    <div className="flex items-center gap-1 shrink-0">
      <Label>View</Label>
      <button
        onClick={() => onView("reset")}
        className="p-1.5 rounded-md"
        style={toggleStyle(false)}
        title="Reset the camera"
        aria-label="Reset the camera"
      >
        <RotateCcw className="w-3.5 h-3.5" />
      </button>
      {VIEWS.map(({ preset, label }) => (
        <button key={preset} onClick={() => onView(preset)} className="px-2 py-1 rounded-md text-xs" style={toggleStyle(false)}>
          {label}
        </button>
      ))}
    </div>
  );
}

/** Tools, mirror toggles, camera views, grid size and the one-finger orbit switch. */
export function VoxelToolbar(props: Props): React.JSX.Element {
  const { tool, size, onSizeChange, oneFingerOrbit, onOneFingerOrbitChange } = props;
  return (
    <div
      className="h-11 flex items-center gap-2 px-3 border-b shrink-0 overflow-x-auto max-md:h-12"
      style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}
    >
      <ToolButtons tool={tool} onToolChange={props.onToolChange} />
      {tool === "box" && <BoxModeButtons isBoxErase={props.isBoxErase} onBoxEraseChange={props.onBoxEraseChange} />}
      <Divider />
      <MirrorButtons symmetry={props.symmetry} onSymmetryChange={props.onSymmetryChange} />
      <Divider />
      <ViewButtons onView={props.onView} />
      <Divider />
      <select
        value={size}
        onChange={(event) => onSizeChange(Number(event.target.value))}
        className="text-xs px-1.5 py-1 rounded-md outline-none shrink-0"
        style={{ background: "var(--bg-primary)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
        aria-label="Grid size"
        title="Grid size. Making it smaller crops cubes that no longer fit."
      >
        {GRID_SIZES.map((option) => (
          <option key={option} value={option}>
            {option}×{option}×{option}
          </option>
        ))}
      </select>
      <button
        onClick={() => onOneFingerOrbitChange(!oneFingerOrbit)}
        className="flex items-center gap-1 px-2 py-1 rounded-md text-xs shrink-0"
        style={toggleStyle(oneFingerOrbit)}
        title="Turn the view with one finger or the left mouse button. Taps still edit."
        aria-pressed={oneFingerOrbit}
      >
        <Hand className="w-3.5 h-3.5" />
        Orbit
      </button>
    </div>
  );
}
