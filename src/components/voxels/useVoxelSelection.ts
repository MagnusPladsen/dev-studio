"use client";

import { useRef, useState } from "react";
import type { Vec3, VoxelGrid } from "@/lib/voxels/grid";
import {
  boundsOfFilled,
  boxAt,
  boxSize,
  clampBox,
  clampMove,
  clearRegion,
  copyRegion,
  fitBox,
  flipClip,
  pasteClip,
  rotateClip,
  type Axis,
  type SelectionBox,
} from "@/lib/voxels/selection";

/** The selected cubes lifted off the model while they're being moved, so moving never eats what's underneath. */
interface Floating {
  under: VoxelGrid;
  clip: VoxelGrid;
  committed: VoxelGrid;
}

interface Clipboard {
  clip: VoxelGrid;
  origin: Vec3;
}

// shared by every model in the tab, so you can copy from one model and paste into another
let clipboard: Clipboard | null = null;

export interface VoxelSelection {
  box: SelectionBox | null;
  message: string | null;
  setBox(box: SelectionBox | null): void;
  selectAll(): void;
  deselect(): void;
  move(delta: Vec3): void;
  rotate(axis: Axis): void;
  flip(axis: Axis): void;
  copy(): void;
  cut(): void;
  paste(): void;
  duplicate(): void;
  remove(): void;
  hasClipboard: boolean;
}

/** Selection, move, rotate, flip and clipboard for the open model. Every change is one undo step. */
export function useVoxelSelection(grid: VoxelGrid, onCommit: (grid: VoxelGrid) => void): VoxelSelection {
  const [box, setBoxState] = useState<SelectionBox | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [hasClipboard, setHasClipboard] = useState(clipboard !== null);
  const floatingRef = useRef<Floating | null>(null);
  const messageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function say(text: string): void {
    setMessage(text);
    if (messageTimer.current) clearTimeout(messageTimer.current);
    messageTimer.current = setTimeout(() => setMessage(null), 2500);
  }

  function setBox(next: SelectionBox | null): void {
    floatingRef.current = null;
    setBoxState(next ? clampBox(next, grid.size) : null);
  }

  /** The selected cubes and the model without them; reuses the lifted state if nothing else changed the model. */
  function lift(current: SelectionBox): Floating {
    const floating = floatingRef.current;
    if (floating && floating.committed === grid) return floating;
    return { under: clearRegion(grid, current), clip: copyRegion(grid, current), committed: grid };
  }

  function place(under: VoxelGrid, clip: VoxelGrid, next: SelectionBox): void {
    const committed = pasteClip(under, clip, next.min);
    floatingRef.current = { under, clip, committed };
    setBoxState(next);
    onCommit(committed);
  }

  function move(delta: Vec3): void {
    if (!box) return;
    const allowed = clampMove(box, delta, grid.size);
    if (allowed.delta.every((d) => d === 0)) {
      say("Can't move further: the selection is at the edge of the grid.");
      return;
    }
    if (allowed.clamped) say("Stopped at the edge of the grid.");
    const { under, clip } = lift(box);
    const min = box.min.map((v, axis) => v + allowed.delta[axis]) as Vec3;
    place(under, clip, boxAt(min, boxSize(box)));
  }

  function rotate(axis: Axis): void {
    if (!box) return;
    const { under, clip } = lift(box);
    const turned = rotateClip(clip, axis);
    place(under, turned, fitBox(box.min, turned.size, grid.size));
  }

  function flip(axis: Axis): void {
    if (!box) return;
    const { under, clip } = lift(box);
    place(under, flipClip(clip, axis), box);
  }

  function copy(): void {
    if (!box) return;
    clipboard = { clip: copyRegion(grid, box), origin: [...box.min] };
    setHasClipboard(true);
    say("Copied. Paste with Ctrl/⌘+V.");
  }

  function cut(): void {
    if (!box) return;
    copy();
    floatingRef.current = null;
    onCommit(clearRegion(grid, box));
    say("Cut. Paste with Ctrl/⌘+V.");
  }

  function paste(): void {
    if (!clipboard) return;
    const target = fitBox(clipboard.origin, clipboard.clip.size, grid.size);
    place(grid, clipboard.clip, target);
    say("Pasted where it was copied from. Move it with the arrow keys.");
  }

  function duplicate(): void {
    if (!box) return;
    // the copy floats over the original; the first move leaves the original behind
    floatingRef.current = { under: grid, clip: copyRegion(grid, box), committed: grid };
    say("Copy made on top of the original. Move it with the arrow keys.");
  }

  function remove(): void {
    if (!box) return;
    const floating = floatingRef.current;
    onCommit(floating && floating.committed === grid ? floating.under : clearRegion(grid, box));
    floatingRef.current = null;
    setBoxState(null);
  }

  function selectAll(): void {
    const bounds = boundsOfFilled(grid);
    if (!bounds) return say("Nothing to select yet.");
    setBox(bounds);
  }

  function deselect(): void {
    floatingRef.current = null;
    setBoxState(null);
  }

  return { box, message, setBox, selectAll, deselect, move, rotate, flip, copy, cut, paste, duplicate, remove, hasClipboard };
}
