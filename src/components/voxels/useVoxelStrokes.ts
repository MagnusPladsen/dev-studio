"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getVoxel, type Vec3, type VoxelGrid } from "@/lib/voxels/grid";
import { fillFaceCells, mirrorCells, paintCells, type Symmetry } from "@/lib/voxels/edit";
import type { RayHit } from "@/lib/voxels/raycast";
import type { StrokeEvent, VoxelTool } from "./types";
import {
  applyBox,
  applyBrush,
  getBoxShellCells,
  getMaxBoxHeight,
  getNormalAxis,
  getTargetCell,
  mirrorInBounds,
  moveBoxDraft,
  startBoxDraft,
  type BoxDraft,
} from "./stroke-tools";

interface BrushStroke {
  base: VoxelGrid;
  live: VoxelGrid;
  plane: { axis: number; value: number } | null;
}

/** "base": the rectangle is being dragged. "height": waiting for the height and a confirming click. */
export interface BoxState {
  draft: BoxDraft;
  stage: "base" | "height";
  maxHeight: number;
}

interface Options {
  grid: VoxelGrid;
  tool: VoxelTool;
  symmetry: Symmetry;
  colorValue: number;
  isBoxErase: boolean;
  onCommit(grid: VoxelGrid): void;
  onPick(value: number): void;
  /** Select tool: the drag from one cell to another; `done` on release. A click on nothing passes null. */
  onSelectDrag?(from: Vec3 | null, to: Vec3 | null, done: boolean): void;
}

export interface VoxelStrokes {
  /** The grid to show: the committed one, or the stroke in progress. */
  displayGrid: VoxelGrid;
  preview: Vec3[];
  isErasePreview: boolean;
  box: BoxState | null;
  handleStroke(event: StrokeEvent): void;
  handleHover(hit: RayHit | null): void;
  setBoxHeight(height: number): void;
  confirmBox(): void;
  cancelBox(): void;
  reset(): void;
}

function getHoverCells(hover: RayHit, tool: VoxelTool, isBoxErase: boolean): Vec3[] {
  if (tool === "select") return [];
  if (tool === "add" || (tool === "box" && !isBoxErase)) return [hover.place];
  return hover.cell ? [hover.cell] : [];
}

/**
 * Turns viewport strokes into grid edits. A brush stroke edits a private copy and commits it
 * once at the end, so the whole stroke is one undo step and a cancelled stroke leaves no trace.
 */
export function useVoxelStrokes(options: Options): VoxelStrokes {
  const { grid, tool, symmetry, isBoxErase } = options;
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });
  const strokeRef = useRef<BrushStroke | null>(null);
  const selectAnchorRef = useRef<Vec3 | null>(null);
  const isConfirmingRef = useRef(false);
  const boxRef = useRef<BoxState | null>(null);
  const [liveGrid, setLiveGrid] = useState<VoxelGrid | null>(null);
  const [box, setBox] = useState<BoxState | null>(null);
  const [hover, setHover] = useState<RayHit | null>(null);

  function updateBox(next: BoxState | null): void {
    boxRef.current = next;
    setBox(next);
  }

  function setDraft(draft: BoxDraft, stage: BoxState["stage"]): void {
    updateBox({ draft, stage, maxHeight: getMaxBoxHeight(draft, latest.current.grid.size) });
  }

  function confirmBox(): void {
    const current = boxRef.current;
    if (!current) return;
    const { grid: committed, colorValue, symmetry: mirror, onCommit } = latest.current;
    const next = applyBox(committed, current.draft, colorValue, mirror);
    updateBox(null);
    if (next !== committed) onCommit(next);
  }

  function cancelBox(): void {
    isConfirmingRef.current = false;
    updateBox(null);
  }

  function setBoxHeight(height: number): void {
    const current = boxRef.current;
    if (!current) return;
    const clamped = Math.max(1, Math.min(current.maxHeight, Math.round(height)));
    setDraft({ ...current.draft, height: clamped }, current.stage);
  }

  function handleBoxStroke(event: StrokeEvent): void {
    const current = boxRef.current;
    if (current?.stage === "height") {
      if (event.phase === "start") isConfirmingRef.current = true;
      if (event.phase === "end" && isConfirmingRef.current) {
        isConfirmingRef.current = false;
        confirmBox();
      }
      return;
    }
    const { hit } = event;
    if (event.phase === "start") {
      if (hit) setDraft(startBoxDraft(hit, latest.current.isBoxErase !== event.shiftKey), "base");
      return;
    }
    if (!current) return;
    const draft = hit ? moveBoxDraft(current.draft, hit) : current.draft;
    setDraft(draft, event.phase === "end" ? "height" : "base");
  }

  function applyBrushHit(hit: RayHit | null): void {
    const stroke = strokeRef.current;
    const { tool: activeTool, colorValue, symmetry: mirror } = latest.current;
    if (!stroke || !hit) return;
    const isAdding = activeTool === "add";
    if (!isAdding && !hit.cell) return;
    const target = getTargetCell(hit, isAdding);
    if (isAdding) {
      const axis = getNormalAxis(hit.normal);
      stroke.plane ??= { axis, value: target[axis] };
      if (target[stroke.plane.axis] !== stroke.plane.value) return;
    }
    const next = applyBrush(stroke.live, activeTool, target, colorValue, mirror);
    if (next === stroke.live) return;
    stroke.live = next;
    setLiveGrid(next);
  }

  function startStroke(hit: RayHit | null): void {
    const { tool: activeTool, grid: committed, colorValue, onCommit, onPick } = latest.current;
    if (activeTool === "pick") {
      if (hit?.cell) onPick(getVoxel(committed, ...hit.cell));
      return;
    }
    if (activeTool === "fill") {
      if (!hit?.cell) return;
      const next = paintCells(committed, fillFaceCells(committed, hit.cell, hit.normal), colorValue);
      if (next !== committed) onCommit(next);
      return;
    }
    strokeRef.current = { base: committed, live: committed, plane: null };
    applyBrushHit(hit);
  }

  function endStroke(): void {
    const stroke = strokeRef.current;
    strokeRef.current = null;
    setLiveGrid(null);
    const isBaseUnchanged = stroke && latest.current.grid === stroke.base;
    if (stroke && isBaseUnchanged && stroke.live !== stroke.base) latest.current.onCommit(stroke.live);
  }

  function cancelStroke(): void {
    strokeRef.current = null;
    setLiveGrid(null);
    isConfirmingRef.current = false;
    if (boxRef.current?.stage === "base") updateBox(null);
  }

  function handleSelectStroke(event: StrokeEvent): void {
    const onSelect = latest.current.onSelectDrag;
    const cell = event.hit ? event.hit.cell ?? event.hit.place : null;
    if (event.phase === "start") {
      selectAnchorRef.current = cell;
      onSelect?.(cell, cell, false);
      return;
    }
    const anchor = selectAnchorRef.current;
    if (!anchor) return;
    if (event.phase === "end") selectAnchorRef.current = null;
    onSelect?.(anchor, cell ?? anchor, event.phase === "end");
  }

  function handleStroke(event: StrokeEvent): void {
    if (event.phase === "start") setHover(null);
    if (event.phase === "cancel") {
      selectAnchorRef.current = null;
      return cancelStroke();
    }
    if (latest.current.tool === "select") return handleSelectStroke(event);
    if (latest.current.tool === "box") return handleBoxStroke(event);
    if (event.phase === "start") startStroke(event.hit);
    else if (event.phase === "move") applyBrushHit(event.hit);
    else endStroke();
  }

  function reset(): void {
    strokeRef.current = null;
    setLiveGrid(null);
    setHover(null);
    cancelBox();
  }

  useBoxKeys(box?.stage === "height", { confirmBox, cancelBox, setBoxHeight, boxRef });

  const size = grid.size;
  const preview = useMemo(() => {
    if (box) return mirrorCells(getBoxShellCells(box.draft, size), size, symmetry);
    if (!hover) return [];
    return mirrorInBounds(getHoverCells(hover, tool, isBoxErase), size, symmetry);
  }, [box, hover, tool, isBoxErase, size, symmetry]);

  const isErasePreview = tool === "erase" || (tool === "box" && (box ? box.draft.isErase : isBoxErase));
  return {
    displayGrid: liveGrid ?? grid,
    preview,
    isErasePreview,
    box,
    handleStroke,
    handleHover: setHover,
    setBoxHeight,
    confirmBox,
    cancelBox,
    reset,
  };
}

interface BoxKeyActions {
  confirmBox(): void;
  cancelBox(): void;
  setBoxHeight(height: number): void;
  boxRef: React.RefObject<BoxState | null>;
}

/** Enter places the box, Escape drops it, the up and down arrows change its height. */
function useBoxKeys(isActive: boolean, actions: BoxKeyActions): void {
  const actionsRef = useRef(actions);
  useEffect(() => {
    actionsRef.current = actions;
  });
  useEffect(() => {
    if (!isActive) return;
    const onKey = (event: KeyboardEvent): void => {
      const { confirmBox, cancelBox, setBoxHeight, boxRef } = actionsRef.current;
      const height = boxRef.current?.draft.height ?? 1;
      const handlers: Record<string, () => void> = {
        Enter: confirmBox,
        Escape: cancelBox,
        ArrowUp: () => setBoxHeight(height + 1),
        ArrowDown: () => setBoxHeight(height - 1),
      };
      const handler = handlers[event.key];
      if (!handler || event.target instanceof HTMLInputElement) return;
      event.preventDefault();
      handler();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isActive]);
}
