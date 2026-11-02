import type { NodeType } from "./cards";
import type { Point, Rect } from "./geometry";

export type ShapeOutline =
  | { kind: "polygon"; points: Point[] }
  | { kind: "ellipse"; cx: number; cy: number; rx: number; ry: number }
  | { kind: "rect"; x: number; y: number; width: number; height: number; radius: number };

const EVENT_INSET = 16;
/** The flow-chart Condition diamond pokes out a little so its label fits; the plain Diamond doesn't. */
const CONDITION_OVERHANG = 4;

function diamond(r: Rect, overhang: number): Point[] {
  const cx = r.x + r.width / 2;
  const cy = r.y + r.height / 2;
  return [
    { x: cx, y: r.y - overhang },
    { x: r.x + r.width + overhang, y: cy },
    { x: cx, y: r.y + r.height + overhang },
    { x: r.x - overhang, y: cy },
  ];
}

function hexagon(r: Rect): Point[] {
  const cy = r.y + r.height / 2;
  return [
    { x: r.x + EVENT_INSET, y: r.y },
    { x: r.x + r.width - EVENT_INSET, y: r.y },
    { x: r.x + r.width, y: cy },
    { x: r.x + r.width - EVENT_INSET, y: r.y + r.height },
    { x: r.x + EVENT_INSET, y: r.y + r.height },
    { x: r.x, y: cy },
  ];
}

/** The outline a shape card draws in its box, shared by the board, the PNG and the SVG export. */
export function shapeOutline(type: NodeType, r: Rect): ShapeOutline {
  if (type === "condition") return { kind: "polygon", points: diamond(r, CONDITION_OVERHANG) };
  if (type === "diamond") return { kind: "polygon", points: diamond(r, 0) };
  if (type === "event") return { kind: "polygon", points: hexagon(r) };
  if (type === "ellipse") return { kind: "ellipse", cx: r.x + r.width / 2, cy: r.y + r.height / 2, rx: r.width / 2, ry: r.height / 2 };
  const radius = type === "state" ? 12 : type === "rectangle" ? 8 : 4;
  return { kind: "rect", x: r.x, y: r.y, width: r.width, height: r.height, radius };
}

export function polygonPoints(points: Point[]): string {
  return points.map((p) => `${p.x},${p.y}`).join(" ");
}
