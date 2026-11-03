"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Wand2, X } from "lucide-react";
import { gridCells, guessGrid, type SheetGrid } from "@/lib/import/sprites";

interface Props {
  file: File;
  onImport(grid: SheetGrid): void;
  onCancel(): void;
}

const PREVIEW_SIZE = 320;
const FALLBACK_GRID: SheetGrid = { cellWidth: 32, cellHeight: 32, spacing: 0, margin: 0 };
const FIELDS: { key: keyof SheetGrid; label: string; min: number }[] = [
  { key: "cellWidth", label: "Cell width", min: 1 },
  { key: "cellHeight", label: "Cell height", min: 1 },
  { key: "spacing", label: "Spacing", min: 0 },
  { key: "margin", label: "Margin", min: 0 },
];

function useLoadedImage(file: File): HTMLImageElement | null {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    let isCurrent = true;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      const img = new window.Image();
      img.onload = () => isCurrent && setImage(img);
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
    return () => {
      isCurrent = false;
      reader.abort();
    };
  }, [file]);
  return image;
}

/** Draws the sheet with the cells outlined, scaled to fit the preview box. */
function drawPreview(canvas: HTMLCanvasElement, image: HTMLImageElement, grid: SheetGrid): void {
  const longest = Math.max(image.width, image.height);
  const zoom = longest > PREVIEW_SIZE ? PREVIEW_SIZE / longest : Math.floor(PREVIEW_SIZE / longest);
  canvas.width = Math.max(1, Math.round(image.width * zoom));
  canvas.height = Math.max(1, Math.round(image.height * zoom));
  const context = canvas.getContext("2d");
  if (!context) return;
  context.imageSmoothingEnabled = false;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const accent = getComputedStyle(canvas).getPropertyValue("--accent").trim() || "magenta";
  context.strokeStyle = accent;
  context.lineWidth = 1;
  for (const cell of gridCells(image.width, image.height, grid)) {
    context.strokeRect(Math.round(cell.x * zoom) + 0.5, Math.round(cell.y * zoom) + 0.5, Math.round(cell.width * zoom) - 1, Math.round(cell.height * zoom) - 1);
  }
}

/** Asks how to cut a sheet image into frames, with the grid drawn over the image as you type. */
export function SliceDialog({ file, onImport, onCancel }: Props): React.JSX.Element {
  const image = useLoadedImage(file);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [edited, setEdited] = useState<SheetGrid | null>(null);
  const guess = useMemo(() => (image ? guessGrid(image.width, image.height) : null), [image]);
  const grid = edited ?? guess ?? FALLBACK_GRID;
  const cells = image ? gridCells(image.width, image.height, grid) : [];

  useEffect(() => {
    if (canvasRef.current && image) drawPreview(canvasRef.current, image, grid);
  }, [image, grid]);

  function setField(key: keyof SheetGrid, value: string, min: number) {
    setEdited({ ...grid, [key]: Math.max(min, Math.min(4096, Math.round(Number(value)) || min)) });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onCancel} role="dialog" aria-modal="true" aria-label="Cut a sheet into frames">
      <div className="w-full max-w-md rounded-2xl p-5 shadow-2xl max-h-full overflow-y-auto" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }} onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between gap-2 mb-1">
          <h2 className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>Cut {file.name} into frames</h2>
          <button onClick={onCancel} className="p-1 rounded shrink-0" style={{ color: "var(--text-primary)" }} title="Close" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
          Each cell becomes a frame of one new sprite, in a new sheet. Empty cells are left out.
        </p>
        <div className="flex items-center justify-center rounded-md p-2 mb-3 overflow-hidden" style={{ minHeight: 120, background: "repeating-conic-gradient(var(--bg-card) 0% 25%, var(--bg-primary) 0% 50%) 0 0 / 12px 12px", border: "1px solid var(--border)" }}>
          {image ? <canvas ref={canvasRef} className="max-w-full" style={{ imageRendering: "pixelated" }} /> : <span className="text-xs" style={{ color: "var(--text-muted)" }}>Reading the picture…</span>}
        </div>
        <div className="grid grid-cols-4 max-sm:grid-cols-2 gap-2 mb-2">
          {FIELDS.map(({ key, label, min }) => (
            <label key={key} className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
              {label}
              <input
                type="number"
                min={min}
                value={grid[key]}
                onChange={(event) => setField(key, event.target.value, min)}
                className="mt-0.5 w-full px-1.5 py-1 rounded text-xs outline-none"
                style={{ background: "var(--bg-primary)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
              />
            </label>
          ))}
        </div>
        <div className="flex items-center justify-between gap-2 mb-4 text-xs" style={{ color: "var(--text-muted)" }}>
          <span>
            {image ? `${image.width}×${image.height} px · ${cells.length} ${cells.length === 1 ? "cell" : "cells"}` : ""}
          </span>
          <button
            onClick={() => setEdited(null)}
            disabled={!guess}
            className="flex items-center gap-1 px-2 py-1 rounded-md disabled:opacity-40"
            style={{ color: "var(--text-primary)", border: "1px solid var(--border)" }}
            title={guess ? "Use the cell size that divides this image evenly" : "No cell size divides this image evenly"}
          >
            <Wand2 className="w-3.5 h-3.5" />
            Auto-detect
          </button>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-3 py-1.5 rounded-md text-xs" style={{ color: "var(--text-primary)", border: "1px solid var(--border)" }}>
            Cancel
          </button>
          <button
            onClick={() => onImport(grid)}
            disabled={!cells.length}
            className="px-3 py-1.5 rounded-md text-xs font-medium disabled:opacity-50"
            style={{ background: "var(--accent)", color: "var(--on-accent, #fff)" }}
          >
            Import {cells.length || ""} {cells.length === 1 ? "frame" : "frames"}
          </button>
        </div>
      </div>
    </div>
  );
}
