import type { DiagramNode } from "@/types";
import type { Point, Rect } from "./geometry";

export type Alignment = "left" | "center" | "right" | "top" | "middle" | "bottom";
export type Axis = "horizontal" | "vertical";

type IdRect = Rect & { id: string };

/** Adds `id` to the selection, or takes it out when it's already in. */
export function toggleId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((other) => other !== id) : [...ids, id];
}

/** The rectangle spanned by two corners, whichever way it was dragged. */
export function rectBetween(a: Point, b: Point): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
}

/** Ids of the rects lying entirely inside `area`, the way a selection box picks cards. */
export function idsWithin(area: Rect, rects: IdRect[]): string[] {
  return rects
    .filter((r) => r.x >= area.x && r.y >= area.y && r.x + r.width <= area.x + area.width && r.y + r.height <= area.y + area.height)
    .map((r) => r.id);
}

/** Moves the chosen nodes to the end of the list, so they draw on top, keeping their own order. */
export function bringToFront(nodes: DiagramNode[], ids: string[]): DiagramNode[] {
  return [...nodes.filter((n) => !ids.includes(n.id)), ...nodes.filter((n) => ids.includes(n.id))];
}

/** Moves the chosen nodes to the start of the list, so they draw underneath, keeping their own order. */
export function sendToBack(nodes: DiagramNode[], ids: string[]): DiagramNode[] {
  return [...nodes.filter((n) => ids.includes(n.id)), ...nodes.filter((n) => !ids.includes(n.id))];
}

function alignedPosition(rect: IdRect, bounds: { left: number; top: number; right: number; bottom: number }, edge: Alignment): Point {
  if (edge === "left") return { x: bounds.left, y: rect.y };
  if (edge === "right") return { x: bounds.right - rect.width, y: rect.y };
  if (edge === "center") return { x: Math.round((bounds.left + bounds.right) / 2 - rect.width / 2), y: rect.y };
  if (edge === "top") return { x: rect.x, y: bounds.top };
  if (edge === "bottom") return { x: rect.x, y: bounds.bottom - rect.height };
  return { x: rect.x, y: Math.round((bounds.top + bounds.bottom) / 2 - rect.height / 2) };
}

/** New top-left corners that line the rects up along one edge or centre line of their shared bounds. */
export function alignRects(rects: IdRect[], edge: Alignment): Map<string, Point> {
  const bounds = {
    left: Math.min(...rects.map((r) => r.x)),
    top: Math.min(...rects.map((r) => r.y)),
    right: Math.max(...rects.map((r) => r.x + r.width)),
    bottom: Math.max(...rects.map((r) => r.y + r.height)),
  };
  return new Map(rects.map((r) => [r.id, alignedPosition(r, bounds, edge)]));
}

/**
 * New top-left corners that leave equal gaps between the rects along one axis. The outermost two
 * stay put; needs at least three rects to change anything.
 */
export function distributeRects(rects: IdRect[], axis: Axis): Map<string, Point> {
  const isHorizontal = axis === "horizontal";
  const start = (r: Rect) => (isHorizontal ? r.x : r.y);
  const size = (r: Rect) => (isHorizontal ? r.width : r.height);
  const ordered = [...rects].sort((a, b) => start(a) - start(b));
  if (ordered.length < 3) return new Map(ordered.map((r) => [r.id, { x: r.x, y: r.y }]));
  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  const span = start(last) + size(last) - start(first);
  const gap = (span - ordered.reduce((sum, r) => sum + size(r), 0)) / (ordered.length - 1);
  const positions = new Map<string, Point>();
  let cursor = start(first);
  for (const r of ordered) {
    const at = Math.round(cursor);
    positions.set(r.id, isHorizontal ? { x: at, y: r.y } : { x: r.x, y: at });
    cursor += size(r) + gap;
  }
  return positions;
}
