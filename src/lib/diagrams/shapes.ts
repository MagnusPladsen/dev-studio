import type { Point, Rect } from "./geometry";

export type ShapeOutline =
  | { kind: "polygon"; points: Point[] }
  | { kind: "ellipse"; cx: number; cy: number; rx: number; ry: number }
  | { kind: "rect"; x: number; y: number; width: number; height: number; radius: number };

const EVENT_INSET = 16;

export function diamondOutline(r: Rect, overhang = 0): ShapeOutline {
  const cx = r.x + r.width / 2;
  const cy = r.y + r.height / 2;
  return {
    kind: "polygon",
    points: [
      { x: cx, y: r.y - overhang },
      { x: r.x + r.width + overhang, y: cy },
      { x: cx, y: r.y + r.height + overhang },
      { x: r.x - overhang, y: cy },
    ],
  };
}

export function hexagonOutline(r: Rect): ShapeOutline {
  const cy = r.y + r.height / 2;
  return {
    kind: "polygon",
    points: [
      { x: r.x + EVENT_INSET, y: r.y },
      { x: r.x + r.width - EVENT_INSET, y: r.y },
      { x: r.x + r.width, y: cy },
      { x: r.x + r.width - EVENT_INSET, y: r.y + r.height },
      { x: r.x + EVENT_INSET, y: r.y + r.height },
      { x: r.x, y: cy },
    ],
  };
}

export function ellipseOutline(r: Rect): ShapeOutline {
  return { kind: "ellipse", cx: r.x + r.width / 2, cy: r.y + r.height / 2, rx: r.width / 2, ry: r.height / 2 };
}

export function roundedRectOutline(r: Rect, radius: number): ShapeOutline {
  return { kind: "rect", x: r.x, y: r.y, width: r.width, height: r.height, radius };
}

export function polygonPoints(points: Point[]): string {
  return points.map((p) => `${p.x},${p.y}`).join(" ");
}
