export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export function centerOf(rect: Rect): Point {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

/** Where the line from the rect's centre towards `toward` leaves the rect, pushed out by `gap`. */
export function borderPoint(rect: Rect, toward: Point, gap = 0): Point {
  const center = centerOf(rect);
  const dx = toward.x - center.x;
  const dy = toward.y - center.y;
  if (dx === 0 && dy === 0) return center;
  const scaleX = dx === 0 ? Infinity : rect.width / 2 / Math.abs(dx);
  const scaleY = dy === 0 ? Infinity : rect.height / 2 / Math.abs(dy);
  const scale = Math.min(scaleX, scaleY);
  const length = Math.hypot(dx, dy);
  const extra = gap / length;
  return { x: center.x + dx * (scale + extra), y: center.y + dy * (scale + extra) };
}

/** The visible part of a line between two cards: from one card's edge to the other's. */
export function edgeEndpoints(from: Rect, to: Rect): { start: Point; end: Point } {
  const start = borderPoint(from, centerOf(to), 2);
  const end = borderPoint(to, centerOf(from), 4);
  return { start, end };
}

const LABEL_OFFSET = 14;

/** Where an edge's label pill sits: beside the middle of the line, on the left of its direction. */
export function edgeLabelPos(start: Point, end: Point): Point {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy) || 1;
  return {
    x: (start.x + end.x) / 2 + (dy / length) * LABEL_OFFSET,
    y: (start.y + end.y) / 2 - (dx / length) * LABEL_OFFSET,
  };
}

export function containsPoint(rect: Rect, point: Point): boolean {
  return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
}

/** Ids of the rects whose centre lies inside `area`. */
export function idsInside(area: Rect, rects: (Rect & { id: string })[]): string[] {
  return rects.filter((rect) => containsPoint(area, centerOf(rect))).map((rect) => rect.id);
}

export const GROUP_HEADER = 40;
export const GROUP_PADDING = 16;
const STACK_GAP = 12;
export const MIN_GROUP_WIDTH = 160;

/**
 * Lines cards up top to bottom inside a group, keeping their current vertical order, and
 * returns their new positions plus the group size that fits them snugly, like a column.
 */
export function stackColumn(group: Rect, cards: (Rect & { id: string })[]) {
  const ordered = [...cards].sort((a, b) => a.y - b.y || a.x - b.x);
  const positions = new Map<string, Point>();
  let y = group.y + GROUP_HEADER;
  let widest = 0;
  for (const card of ordered) {
    positions.set(card.id, { x: group.x + GROUP_PADDING, y });
    y += card.height + STACK_GAP;
    widest = Math.max(widest, card.width);
  }
  const width = Math.max(MIN_GROUP_WIDTH, widest + GROUP_PADDING * 2);
  const height = Math.max(GROUP_HEADER + GROUP_PADDING, y - STACK_GAP - group.y + GROUP_PADDING);
  return { positions, width, height };
}

export function boundsOf(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null;
  const left = Math.min(...rects.map((r) => r.x));
  const top = Math.min(...rects.map((r) => r.y));
  const right = Math.max(...rects.map((r) => r.x + r.width));
  const bottom = Math.max(...rects.map((r) => r.y + r.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}
