"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { MAX_COLORS } from "@/lib/voxels/colors";
import type { Palette } from "@/types";

interface Props {
  projectId: string;
  colors: string[];
  /** 1-based colour value, as stored in the grid. */
  value: number;
  onSelect(value: number): void;
  onAddColor(hex: string): void;
  palettes: Palette[];
  initialPaletteId?: string;
  onUsePalette(paletteId: string): void;
}

const fieldStyle: React.CSSProperties = {
  background: "var(--bg-primary)",
  color: "var(--text-primary)",
  border: "1px solid var(--border)",
};

function Swatches({ colors, value, onSelect }: Pick<Props, "colors" | "value" | "onSelect">): React.JSX.Element {
  return (
    <div className="flex-1 flex items-center gap-1 flex-wrap min-w-0 p-0.5 md:max-h-16 md:overflow-y-auto max-xl:flex-nowrap max-xl:basis-full max-xl:overflow-x-auto">
      {colors.map((color, index) => {
        const swatchValue = index + 1;
        const isSelected = swatchValue === value;
        return (
          <button
            key={`value-${swatchValue}`}
            onClick={() => onSelect(swatchValue)}
            className="w-5 h-5 rounded-sm border shrink-0 max-md:w-7 max-md:h-7"
            style={{
              background: color,
              borderColor: isSelected ? "var(--accent)" : "var(--border)",
              outline: isSelected ? "2px solid var(--accent)" : "none",
              outlineOffset: 1,
            }}
            title={color}
            aria-label={`Colour ${color}`}
            aria-pressed={isSelected}
          />
        );
      })}
    </div>
  );
}

function AddColor({ colors, value, onAddColor }: Pick<Props, "colors" | "value" | "onAddColor">): React.JSX.Element {
  const [draft, setDraft] = useState(colors[value - 1] ?? "#ffffff");
  const isFull = colors.length >= MAX_COLORS;
  return (
    <div className="flex items-center gap-1 shrink-0">
      <input
        type="color"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        className="w-7 h-7 cursor-pointer"
        style={{ background: "transparent", border: "none" }}
        title="Choose a new colour"
        aria-label="Choose a new colour"
      />
      <button
        onClick={() => onAddColor(draft)}
        disabled={isFull}
        className="flex items-center gap-1 px-2 py-1 rounded-md text-xs whitespace-nowrap disabled:opacity-40"
        style={{ color: "var(--text-primary)", border: "1px solid var(--border)" }}
        title={isFull ? `A model can hold ${MAX_COLORS} colours` : "Add this colour to the model"}
      >
        <Plus className="w-3 h-3" />
        Add colour
      </button>
    </div>
  );
}

function PalettePicker({ projectId, palettes, initialPaletteId, onUsePalette }: Pick<Props, "projectId" | "palettes" | "initialPaletteId" | "onUsePalette">): React.JSX.Element {
  const [picked, setPicked] = useState(initialPaletteId ?? palettes[0]?.id ?? "");
  const pickedId = palettes.some((palette) => palette.id === picked) ? picked : (palettes[0]?.id ?? "");
  if (palettes.length === 0) {
    return (
      <Link href={`/project/${projectId}/palettes`} className="text-[11px] hover:underline shrink-0" style={{ color: "var(--text-secondary)" }}>
        Make a palette →
      </Link>
    );
  }
  return (
    <div className="flex items-center gap-1 shrink-0">
      <select
        value={pickedId}
        onChange={(event) => setPicked(event.target.value)}
        className="text-xs px-1.5 py-1 rounded-md outline-none max-w-36"
        style={fieldStyle}
        aria-label="Palette"
      >
        {palettes.map((palette) => (
          <option key={palette.id} value={palette.id}>
            {palette.name}
          </option>
        ))}
      </select>
      <button
        onClick={() => onUsePalette(pickedId)}
        className="px-2 py-1 rounded-md text-xs whitespace-nowrap"
        style={{ color: "var(--text-primary)", border: "1px solid var(--border)" }}
        title="Swap the model's colours for this palette. Cubes keep the nearest colour."
      >
        Use palette
      </button>
      <Link href={`/project/${projectId}/palettes`} className="text-[11px] hover:underline max-md:hidden" style={{ color: "var(--text-secondary)" }}>
        Manage →
      </Link>
    </div>
  );
}

/** The model's own colours, a way to add one, and a project palette picker. */
export function ColorStrip(props: Props): React.JSX.Element {
  return (
    <div
      className="shrink-0 flex items-center gap-3 px-3 py-2 border-t max-xl:flex-wrap max-xl:gap-2 max-xl:landscape:flex-nowrap"
      style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}
    >
      <Swatches colors={props.colors} value={props.value} onSelect={props.onSelect} />
      <div className="w-px h-5 shrink-0 max-md:hidden" style={{ background: "var(--border)" }} />
      <AddColor colors={props.colors} value={props.value} onAddColor={props.onAddColor} />
      <div className="ml-auto shrink-0">
        <PalettePicker
          projectId={props.projectId}
          palettes={props.palettes}
          initialPaletteId={props.initialPaletteId}
          onUsePalette={props.onUsePalette}
        />
      </div>
    </div>
  );
}
