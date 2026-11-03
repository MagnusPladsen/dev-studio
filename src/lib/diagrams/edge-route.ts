import type { RelationEnd } from "./tables";
import { borderPoint, centerOf, edgeEndpoints, edgeLabelPos, type Point, type Rect } from "./geometry";

/** One end of a line: the card's box and, for a line attached to a table row, that row's middle. */
export interface EdgeEnd {
  rect: Rect;
  anchorY?: number;
}

export interface EdgeRoute {
  points: Point[];
  labelAt: Point;
}

/** How far a row-attached line runs straight out of the table before it turns. */
const STUB = 22;
const START_GAP = 2;
const END_GAP = 4;

function rowPort(end: EdgeEnd, toward: Point, gap: number): { anchor: Point; stub: Point } {
  const side = toward.x >= centerOf(end.rect).x ? 1 : -1;
  const x = side > 0 ? end.rect.x + end.rect.width + gap : end.rect.x - gap;
  return { anchor: { x, y: end.anchorY! }, stub: { x: x + side * STUB, y: end.anchorY! } };
}

function aimOf(end: EdgeEnd): Point {
  const center = centerOf(end.rect);
  return end.anchorY === undefined ? center : { x: center.x, y: end.anchorY };
}

/**
 * The path a line takes. Card to card it is the straight line between their edges; a line attached to
 * a table row leaves that row sideways, towards the other end, so it is clear which row it belongs to.
 */
export function routeEdge(from: EdgeEnd, to: EdgeEnd): EdgeRoute {
  if (from.anchorY === undefined && to.anchorY === undefined) {
    const { start, end } = edgeEndpoints(from.rect, to.rect);
    return { points: [start, end], labelAt: edgeLabelPos(start, end) };
  }
  const head = from.anchorY === undefined ? null : rowPort(from, aimOf(to), START_GAP);
  const tail = to.anchorY === undefined ? null : rowPort(to, aimOf(from), END_GAP);
  const start = head ? head.anchor : borderPoint(from.rect, tail!.stub, START_GAP);
  const end = tail ? tail.anchor : borderPoint(to.rect, head!.stub, END_GAP);
  const points = [start, ...(head ? [head.stub] : []), ...(tail ? [tail.stub] : []), end];
  const middle = Math.floor((points.length - 1) / 2);
  return { points, labelAt: edgeLabelPos(points[middle], points[middle + 1]) };
}

export function pointsAttribute(points: Point[]): string {
  return points.map((p) => `${p.x},${p.y}`).join(" ");
}

export type Segment = [Point, Point];

/** The crow's-foot mark at one end of a route: a bar for "one", a three-toed foot for "many". */
export function relationMark(points: Point[], at: "start" | "end", kind: RelationEnd): Segment[] {
  const tip = at === "start" ? points[0] : points[points.length - 1];
  const before = at === "start" ? points[1] : points[points.length - 2];
  const length = Math.hypot(tip.x - before.x, tip.y - before.y) || 1;
  const dir = { x: (tip.x - before.x) / length, y: (tip.y - before.y) / length };
  const perp = { x: -dir.y, y: dir.x };
  const along = (distance: number, side = 0): Point => ({ x: tip.x - dir.x * distance + perp.x * side, y: tip.y - dir.y * distance + perp.y * side });
  if (kind === "one") return [[along(9, 6), along(9, -6)]];
  const heel = along(13);
  return [[heel, along(0, 6)], [heel, along(0)], [heel, along(0, -6)]];
}
