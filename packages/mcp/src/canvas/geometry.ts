import type { DiagramNode } from "@/types";
import type { Point, Rect } from "@/lib/diagrams/geometry";
import { tableColumns, tableHeight } from "@/lib/diagrams/tables";

export type Side = "right" | "below" | "left" | "above";

const GAP = 40;
const MAX_TRIES = 200;
const NOTE_LINE = 20;
const NOTE_PADDING = 36;
const CHAR_WIDTH = 7.5;
const CHECKLIST_HEADER = 44;
const CHECKLIST_ROW = 28;

/** The box an element takes up on the board: a table is as tall as its rows. */
export function rectFor(node: DiagramNode): Rect {
  const height = node.type === "table" ? tableHeight(tableColumns(node).length) : node.height;
  return { x: node.x, y: node.y, width: node.width, height };
}

function wrappedLines(text: string, width: number): number {
  const perLine = Math.max(1, Math.floor((width - 24) / CHAR_WIDTH));
  return text.split("\n").reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / perLine)), 0);
}

/**
 * A starting height for cards whose height follows their content (the board measures them later), so
 * the server's placement leaves room for long notes and lists instead of stacking cards on top of them.
 */
export function estimatedHeight(node: DiagramNode, items = 0): number {
  if (node.type === "note") return Math.max(node.height, NOTE_PADDING + NOTE_LINE * wrappedLines(node.label, node.width));
  if (node.type === "checklist") return Math.max(node.height, CHECKLIST_HEADER + CHECKLIST_ROW * items);
  return node.height;
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width + GAP && b.x < a.x + a.width + GAP && a.y < b.y + b.height + GAP && b.y < a.y + a.height + GAP;
}

function firstSpot(target: Rect, size: { width: number; height: number }, side: Side): Point {
  if (side === "right") return { x: target.x + target.width + GAP, y: target.y };
  if (side === "left") return { x: target.x - GAP - size.width, y: target.y };
  if (side === "below") return { x: target.x, y: target.y + target.height + GAP };
  return { x: target.x, y: target.y - GAP - size.height };
}

/** The first free spot on `side` of `target`, sliding along that side past anything in the way. */
export function besideRect(target: Rect, size: { width: number; height: number }, side: Side, taken: Rect[]): Point {
  const start = firstSpot(target, size, side);
  const isVertical = side === "right" || side === "left";
  for (let step = 0; step < MAX_TRIES; step++) {
    const at = isVertical ? { x: start.x, y: start.y + step * GAP } : { x: start.x + step * GAP, y: start.y };
    if (!taken.some((rect) => overlaps({ ...at, ...size }, rect))) return { x: Math.round(at.x), y: Math.round(at.y) };
  }
  return { x: Math.round(start.x), y: Math.round(start.y) };
}
