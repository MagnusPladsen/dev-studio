"use client";

import { useEffect, useRef, useSyncExternalStore, type RefObject } from "react";
import { isTextField } from "@/hooks/useHistory";

/** Space activates these natively, so holding it there never turns into panning. */
const SPACE_ACTIVATES_SELECTOR = "button, a, select, summary, input, textarea, [role=button], [role=menuitem], [role=tab], [role=checkbox], [role=switch]";

let isHeld = false;
const listeners = new Set<() => void>();

function setHeld(next: boolean): void {
  if (isHeld === next) return;
  isHeld = next;
  for (const listener of listeners) listener();
}

function isSpaceActivated(target: EventTarget | null): boolean {
  return isTextField(target) || (target instanceof Element && target.closest(SPACE_ACTIVATES_SELECTOR) !== null);
}

function handleKeyDown(event: KeyboardEvent): void {
  if (event.key !== " " || event.ctrlKey || event.metaKey || event.altKey) return;
  if (isSpaceActivated(event.target)) return;
  event.preventDefault();
  setHeld(true);
}

function handleKeyUp(event: KeyboardEvent): void {
  if (event.key === " ") setHeld(false);
}

function release(): void {
  setHeld(false);
}

function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) {
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", release);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0) return;
    window.removeEventListener("keydown", handleKeyDown);
    window.removeEventListener("keyup", handleKeyUp);
    window.removeEventListener("blur", release);
    release();
  };
}

/** Read inside pointer handlers: true while Space is held on a view that uses the hooks below. */
export function isSpaceHeld(): boolean {
  return isHeld;
}

/**
 * Hold Space and drag to move around a view, like in design tools: while it is held, the view's own
 * pointer handlers should pan instead of selecting, drawing or moving things. Returns whether it is held,
 * for the grab cursor. Space in text fields and on buttons keeps its normal meaning.
 */
export function useSpaceHeld(): boolean {
  return useSyncExternalStore(subscribe, isSpaceHeld, () => false);
}

interface ScrollDrag {
  pointerId: number;
  x: number;
  y: number;
}

/**
 * For views that scroll (Pixel Art, the Music piano roll): holding Space and dragging scrolls the container instead of
 * reaching the canvas inside, so nothing is painted while moving around.
 */
export function useSpaceScrollPan(containerRef: RefObject<HTMLElement | null>): boolean {
  const isHeldNow = useSpaceHeld();
  const drag = useRef<ScrollDrag | null>(null);

  useEffect(() => {
    const swallow = (event: PointerEvent): void => {
      event.preventDefault();
      event.stopPropagation();
    };
    const down = (event: PointerEvent): void => {
      const container = containerRef.current;
      if (!isHeld || event.button !== 0 || !container || !(event.target instanceof Node) || !container.contains(event.target)) return;
      swallow(event);
      container.setPointerCapture(event.pointerId);
      drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    };
    const move = (event: PointerEvent): void => {
      const current = drag.current;
      if (!current || current.pointerId !== event.pointerId) return;
      swallow(event);
      containerRef.current?.scrollBy(current.x - event.clientX, current.y - event.clientY);
      drag.current = { ...current, x: event.clientX, y: event.clientY };
    };
    const up = (event: PointerEvent): void => {
      if (drag.current?.pointerId !== event.pointerId) return;
      swallow(event);
      drag.current = null;
    };
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", up, true);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", up, true);
    };
  }, [containerRef]);

  return isHeldNow;
}
