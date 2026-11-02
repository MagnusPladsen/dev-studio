import type { Point } from "./menu-position";

/** Pan/zoom maths for graph views: screen = world * scale + offset. */

export interface Camera {
  x: number;
  y: number;
  scale: number;
}

export interface Circle extends Point {
  radius: number;
}

export const MIN_SCALE = 0.15;
export const MAX_SCALE = 4;

export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

export function screenToWorld(camera: Camera, point: Point): Point {
  return { x: (point.x - camera.x) / camera.scale, y: (point.y - camera.y) / camera.scale };
}

/** Zooms by `factor` keeping the world point under `anchor` (screen coords) still. */
export function zoomAt(camera: Camera, factor: number, anchor: Point): Camera {
  const scale = clampScale(camera.scale * factor);
  const world = screenToWorld(camera, anchor);
  return { scale, x: anchor.x - world.x * scale, y: anchor.y - world.y * scale };
}

export function centerOn(camera: Camera, world: Point, viewport: { width: number; height: number }, scale = camera.scale): Camera {
  const clamped = clampScale(scale);
  return { scale: clamped, x: viewport.width / 2 - world.x * clamped, y: viewport.height / 2 - world.y * clamped };
}

/** The camera that fits every circle into the viewport, never zooming in past 1.5×. */
export function fitCamera(circles: Circle[], viewport: { width: number; height: number }, padding = Math.min(40, viewport.width * 0.05)): Camera {
  if (circles.length === 0) return { x: viewport.width / 2, y: viewport.height / 2, scale: 1 };
  const minX = Math.min(...circles.map((c) => c.x - c.radius));
  const maxX = Math.max(...circles.map((c) => c.x + c.radius));
  const minY = Math.min(...circles.map((c) => c.y - c.radius));
  const maxY = Math.max(...circles.map((c) => c.y + c.radius));
  const width = Math.max(maxX - minX, 1);
  const height = Math.max(maxY - minY, 1);
  const scale = Math.min(1.5, (viewport.width - padding * 2) / width, (viewport.height - padding * 2) / height);
  return centerOn({ x: 0, y: 0, scale }, { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }, viewport, scale);
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
