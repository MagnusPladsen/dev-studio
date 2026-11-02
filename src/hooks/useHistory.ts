"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const BURST_MS = 500;
const LIMIT = 200;

export interface History {
  undo(): void;
  redo(): void;
  canUndo: boolean;
  canRedo: boolean;
  /** End the current burst, so the next change starts a new undo step. */
  checkpoint(): void;
}

export function isTextField(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
  if (el instanceof HTMLInputElement) return !["range", "checkbox", "radio", "color", "button", "submit"].includes(el.type);
  return false;
}

/** Ctrl/⌘+Z undo, Ctrl/⌘+Shift+Z or Ctrl+Y redo. Text fields keep their own native undo. */
export function useUndoShortcuts(undo: () => void, redo: () => void, enabled = true) {
  const ref = useRef({ undo, redo });
  ref.current = { undo, redo };
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || isTextField(e.target)) return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        ref.current.undo();
      } else if ((key === "z" && e.shiftKey) || (key === "y" && !e.metaKey)) {
        e.preventDefault();
        ref.current.redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}

/**
 * Undo/redo for an editor's document state.
 *
 * Pass the current value (updated immutably) and a function that puts an older value back.
 * Rapid changes within half a second (dragging, painting a stroke, typing a number) are grouped
 * into one step. Change `resetKey` (e.g. the open asset's id) to start a fresh history.
 * Editors that already hand over one value per finished stroke can pass `burstMs: 0` so every
 * change is its own step.
 */
export function useHistory<T>(
  value: T,
  apply: (v: T) => void,
  resetKey?: unknown,
  { burstMs = BURST_MS }: { burstMs?: number } = {}
): History {
  const past = useRef<T[]>([]);
  const future = useRef<T[]>([]);
  const last = useRef(value);
  const applying = useRef(false);
  const burst = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, bump] = useState(0);
  const rerender = () => bump((n) => n + 1);

  useEffect(() => {
    past.current = [];
    future.current = [];
    last.current = value;
    if (burst.current) clearTimeout(burst.current);
    burst.current = null;
    rerender();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  useEffect(() => {
    if (Object.is(value, last.current)) return;
    if (applying.current) {
      applying.current = false;
      last.current = value;
      return;
    }
    if (!burst.current) {
      past.current.push(last.current);
      if (past.current.length > LIMIT) past.current.shift();
      future.current = [];
      rerender();
    } else {
      clearTimeout(burst.current);
    }
    burst.current = setTimeout(() => (burst.current = null), burstMs);
    last.current = value;
  }, [value, burstMs]);

  const applyRef = useRef(apply);
  applyRef.current = apply;

  const step = useCallback((from: React.RefObject<T[]>, to: React.RefObject<T[]>) => {
    const target = from.current.pop();
    if (target === undefined) return;
    if (burst.current) clearTimeout(burst.current);
    burst.current = null;
    to.current.push(last.current);
    last.current = target;
    applying.current = true;
    applyRef.current(target);
    rerender();
  }, []);

  const undo = useCallback(() => step(past, future), [step]);
  const redo = useCallback(() => step(future, past), [step]);
  const checkpoint = useCallback(() => {
    if (burst.current) clearTimeout(burst.current);
    burst.current = null;
  }, []);
  useUndoShortcuts(undo, redo);

  return { undo, redo, canUndo: past.current.length > 0, canRedo: future.current.length > 0, checkpoint };
}
