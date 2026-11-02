"use client";

import { useEffect, useRef, useState } from "react";
import { getVoxel, type Vec3, type VoxelGrid } from "@/lib/voxels/grid";
import { mirrorCells, paintCells, setCells, type Symmetry } from "@/lib/voxels/edit";
import type { SelectionBox } from "@/lib/voxels/selection";
import {
  AXIS_INDEX,
  cellToSlice,
  inSlice,
  sliceDims,
  sliceFloodCells,
  sliceRectBox,
  sliceRectCells,
  sliceToCell,
  type SliceAxis,
  type SlicePoint,
} from "@/lib/voxels/slice";
import type { VoxelTool } from "./types";

interface Props {
  grid: VoxelGrid;
  colors: string[];
  axis: SliceAxis;
  layer: number;
  tool: VoxelTool;
  colorValue: number;
  symmetry: Symmetry;
  showBelow: boolean;
  selection: SelectionBox | null;
  selectAllLayers: boolean;
  onCommit(grid: VoxelGrid): void;
  onPick(value: number): void;
  onSelect(box: SelectionBox | null): void;
}

interface Stroke {
  base: VoxelGrid;
  live: VoxelGrid;
  start: SlicePoint;
  last: SlicePoint;
  isErase: boolean;
}

const MIN_CELL = 4;
const MAX_CELL = 48;

/** Cells on the straight line between two slice points, so fast pencil strokes have no gaps. */
function lineBetween(a: SlicePoint, b: SlicePoint): SlicePoint[] {
  const points: SlicePoint[] = [];
  let [x, y] = a;
  const dx = Math.abs(b[0] - x), dy = -Math.abs(b[1] - y);
  const sx = x < b[0] ? 1 : -1, sy = y < b[1] ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    points.push([x, y]);
    if (x === b[0] && y === b[1]) return points;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

function boxOnLayer(box: SelectionBox, size: Vec3, axis: SliceAxis, layer: number): [SlicePoint, SlicePoint] | null {
  const index = AXIS_INDEX[axis];
  if (layer < box.min[index] || layer > box.max[index]) return null;
  const a = cellToSlice(size, axis, box.min).point;
  const b = cellToSlice(size, axis, box.max).point;
  return [
    [Math.min(a[0], b[0]), Math.min(a[1], b[1])],
    [Math.max(a[0], b[0]), Math.max(a[1], b[1])],
  ];
}

/** One layer of the model as a flat pixel grid you can draw on. */
export function SliceEditor(props: Props): React.JSX.Element {
  const { grid, colors, axis, layer, showBelow, selection } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokeRef = useRef<Stroke | null>(null);
  const latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  });
  const [liveGrid, setLiveGrid] = useState<VoxelGrid | null>(null);
  const [rect, setRect] = useState<[SlicePoint, SlicePoint] | null>(null);
  const [cellPx, setCellPx] = useState(16);
  const [cols, rows] = sliceDims(grid.size, axis);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const fit = (): void => {
      const pad = 24;
      const px = Math.floor(Math.min((container.clientWidth - pad) / cols, (container.clientHeight - pad) / rows));
      setCellPx(Math.max(MIN_CELL, Math.min(MAX_CELL, px)));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(container);
    return () => observer.disconnect();
  }, [cols, rows]);

  const shown = liveGrid ?? grid;
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = cols * cellPx * dpr;
    canvas.height = rows * cellPx * dpr;
    canvas.style.width = `${cols * cellPx}px`;
    canvas.style.height = `${rows * cellPx}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        ctx.fillStyle = (col + row) % 2 === 0 ? "#1a1a2a" : "#20203a";
        ctx.fillRect(col * cellPx, row * cellPx, cellPx, cellPx);
        const value = getVoxel(shown, ...sliceToCell(shown.size, axis, layer, [col, row]));
        if (value) {
          ctx.globalAlpha = 1;
          ctx.fillStyle = colors[value - 1] ?? "#ff00ff";
          ctx.fillRect(col * cellPx, row * cellPx, cellPx, cellPx);
        } else if (showBelow && layer > 0) {
          const below = getVoxel(shown, ...sliceToCell(shown.size, axis, layer - 1, [col, row]));
          if (below) {
            ctx.globalAlpha = 0.22;
            ctx.fillStyle = colors[below - 1] ?? "#ff00ff";
            ctx.fillRect(col * cellPx, row * cellPx, cellPx, cellPx);
            ctx.globalAlpha = 1;
          }
        }
      }
    }
    if (cellPx >= 8) {
      ctx.strokeStyle = "rgba(255,255,255,0.07)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let col = 0; col <= cols; col++) {
        ctx.moveTo(col * cellPx + 0.5, 0);
        ctx.lineTo(col * cellPx + 0.5, rows * cellPx);
      }
      for (let row = 0; row <= rows; row++) {
        ctx.moveTo(0, row * cellPx + 0.5);
        ctx.lineTo(cols * cellPx, row * cellPx + 0.5);
      }
      ctx.stroke();
    }
    const outline = (r: [SlicePoint, SlicePoint], color: string, dashed: boolean): void => {
      const [a, b] = r;
      ctx.setLineDash(dashed ? [4, 3] : []);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(
        Math.min(a[0], b[0]) * cellPx + 1,
        Math.min(a[1], b[1]) * cellPx + 1,
        (Math.abs(a[0] - b[0]) + 1) * cellPx - 2,
        (Math.abs(a[1] - b[1]) + 1) * cellPx - 2
      );
      ctx.setLineDash([]);
    };
    const selected = selection ? boxOnLayer(selection, shown.size, axis, layer) : null;
    if (selected) outline(selected, "#4dd0ff", true);
    if (rect) outline(rect, "#ffffff", true);
  }, [shown, colors, axis, layer, cols, rows, cellPx, showBelow, selection, rect]);

  function pointAt(event: React.PointerEvent): SlicePoint | null {
    const bounds = canvasRef.current?.getBoundingClientRect();
    if (!bounds) return null;
    const point: SlicePoint = [Math.floor((event.clientX - bounds.left) / cellPx), Math.floor((event.clientY - bounds.top) / cellPx)];
    return inSlice(grid.size, axis, point) ? point : null;
  }

  function apply(stroke: Stroke, points: SlicePoint[]): void {
    const { tool: activeTool, colorValue, symmetry } = latest.current;
    const size = stroke.live.size;
    const cells = mirrorCells(points.map((p) => sliceToCell(size, axis, layer, p)), size, symmetry);
    const next =
      activeTool === "erase" || stroke.isErase
        ? setCells(stroke.live, cells, 0)
        : activeTool === "paint"
          ? paintCells(stroke.live, cells, colorValue)
          : setCells(stroke.live, cells, colorValue);
    if (next === stroke.live) return;
    stroke.live = next;
    setLiveGrid(next);
  }

  function onPointerDown(event: React.PointerEvent<HTMLCanvasElement>): void {
    if (event.button !== 0) return;
    const point = pointAt(event);
    const { grid: committed, tool: activeTool, colorValue, onPick, onCommit, onSelect, symmetry } = latest.current;
    if (!point) {
      if (activeTool === "select") onSelect(null);
      return;
    }
    if (activeTool === "pick") {
      const value = getVoxel(committed, ...sliceToCell(committed.size, axis, layer, point));
      if (value) onPick(value);
      return;
    }
    if (activeTool === "fill") {
      const cells = mirrorCells(sliceFloodCells(committed, axis, layer, point), committed.size, symmetry);
      const next = setCells(committed, cells, colorValue);
      if (next !== committed) onCommit(next);
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    strokeRef.current = { base: committed, live: committed, start: point, last: point, isErase: activeTool === "box" && event.shiftKey };
    if (activeTool === "box" || activeTool === "select") setRect([point, point]);
    else apply(strokeRef.current, [point]);
  }

  function onPointerMove(event: React.PointerEvent<HTMLCanvasElement>): void {
    const stroke = strokeRef.current;
    if (!stroke) return;
    const point = pointAt(event);
    if (!point || (point[0] === stroke.last[0] && point[1] === stroke.last[1])) return;
    const activeTool = latest.current.tool;
    if (activeTool === "box" || activeTool === "select") setRect([stroke.start, point]);
    else apply(stroke, lineBetween(stroke.last, point));
    stroke.last = point;
  }

  function onPointerUp(): void {
    const stroke = strokeRef.current;
    strokeRef.current = null;
    if (!stroke) return;
    const { tool: activeTool, onCommit, onSelect, selectAllLayers } = latest.current;
    if (activeTool === "select") {
      onSelect(sliceRectBox(stroke.base.size, axis, layer, stroke.start, stroke.last, selectAllLayers));
    } else if (activeTool === "box") {
      apply(stroke, sliceRectCells(stroke.base.size, axis, layer, stroke.start, stroke.last).map((c) => cellToSlice(stroke.base.size, axis, c).point));
    }
    setRect(null);
    setLiveGrid(null);
    // one stroke = one undo step; skip if the model changed under us (e.g. undo mid-stroke)
    if (stroke.live !== stroke.base && latest.current.grid === stroke.base) onCommit(stroke.live);
  }

  function onPointerCancel(): void {
    strokeRef.current = null;
    setRect(null);
    setLiveGrid(null);
  }

  return (
    <div ref={containerRef} className="h-full w-full overflow-auto flex items-center justify-center p-3">
      <canvas
        ref={canvasRef}
        className="block cursor-crosshair shrink-0"
        style={{ touchAction: "none", imageRendering: "pixelated", borderRadius: 4, boxShadow: "0 0 0 1px var(--border)" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        aria-label={`Layer ${layer + 1} of the model. Draw to add cubes.`}
        role="img"
      />
    </div>
  );
}
