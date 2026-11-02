import type { DiagramNode } from "@/types";
import type { Point } from "./geometry";

/** How far, in board pixels, a point may stray from the simplified line before it's kept. */
export const SIMPLIFY_TOLERANCE = 1.5;
export const DRAWING_STROKE = 3;

function distanceToSegment(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}

/** Ramer–Douglas–Peucker: drops points that lie within `tolerance` of the line through their neighbours. */
export function simplifyPath(points: Point[], tolerance = SIMPLIFY_TOLERANCE): Point[] {
  if (points.length < 3) return [...points];
  const first = points[0];
  const last = points[points.length - 1];
  let farthest = 0;
  let farthestIndex = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const distance = distanceToSegment(points[i], first, last);
    if (distance > farthest) {
      farthest = distance;
      farthestIndex = i;
    }
  }
  if (farthest <= tolerance) return [first, last];
  const head = simplifyPath(points.slice(0, farthestIndex + 1), tolerance);
  const tail = simplifyPath(points.slice(farthestIndex), tolerance);
  return [...head.slice(0, -1), ...tail];
}

export interface Stroke {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Points relative to the stroke's top-left corner, rounded to tenths. */
  points: Point[];
}

const round = (value: number) => Math.round(value * 10) / 10;

/** Turns board points into a box plus points inside it. A single tap becomes a dot. */
export function strokeFromPoints(points: Point[], tolerance = SIMPLIFY_TOLERANCE): Stroke {
  const kept = simplifyPath(points, tolerance);
  const path = kept.length === 1 ? [kept[0], kept[0]] : kept;
  const left = Math.min(...path.map((p) => p.x));
  const top = Math.min(...path.map((p) => p.y));
  const width = Math.max(1, Math.max(...path.map((p) => p.x)) - left);
  const height = Math.max(1, Math.max(...path.map((p) => p.y)) - top);
  return { x: round(left), y: round(top), width: round(width), height: round(height), points: path.map((p) => ({ x: round(p.x - left), y: round(p.y - top) })) };
}

/** A drawing's stored points and the box they were drawn in; resizing scales them from that box. */
export function drawingStroke(node: DiagramNode): { points: Point[]; box: { width: number; height: number } } {
  const raw = Array.isArray(node.data?.points) ? (node.data.points as unknown[]) : [];
  const points = raw.flatMap((p) =>
    Array.isArray(p) && typeof p[0] === "number" && typeof p[1] === "number" ? [{ x: p[0], y: p[1] }] : []
  );
  const box = node.data?.box as { width?: unknown; height?: unknown } | undefined;
  const width = typeof box?.width === "number" && box.width > 0 ? box.width : node.width;
  const height = typeof box?.height === "number" && box.height > 0 ? box.height : node.height;
  return { points, box: { width, height } };
}

/** The data a drawing node stores: points as `[x, y]` pairs (compact JSON) and their box. */
export function drawingData(stroke: Stroke): Record<string, unknown> {
  return { points: stroke.points.map((p) => [p.x, p.y]), box: { width: stroke.width, height: stroke.height } };
}

/** A drawing's points placed in its current box on the board. */
export function placedPoints(node: DiagramNode): Point[] {
  const { points, box } = drawingStroke(node);
  const scaleX = node.width / box.width;
  const scaleY = node.height / box.height;
  return points.map((p) => ({ x: node.x + p.x * scaleX, y: node.y + p.y * scaleY }));
}

/** SVG path data that runs through the points with smooth curves between their midpoints. */
export function smoothPath(points: Point[]): string {
  if (points.length === 0) return "";
  const fmt = (p: Point) => `${round(p.x)} ${round(p.y)}`;
  if (points.length < 3) return `M${fmt(points[0])} L${fmt(points[points.length - 1])}`;
  let d = `M${fmt(points[0])}`;
  for (let i = 1; i < points.length - 1; i++) {
    const mid = { x: (points[i].x + points[i + 1].x) / 2, y: (points[i].y + points[i + 1].y) / 2 };
    d += ` Q${fmt(points[i])} ${fmt(mid)}`;
  }
  return `${d} L${fmt(points[points.length - 1])}`;
}
