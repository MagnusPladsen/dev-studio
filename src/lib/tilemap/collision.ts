import type { TilemapData } from "@/types";

/** What a collision cell holds. Old maps have no collision grid: every cell is empty. */
export const COLLISION = { empty: 0, solid: 1, oneWay: 2 } as const;
export type CollisionValue = (typeof COLLISION)[keyof typeof COLLISION];

/** The Tiled object type each kind of collision is written as, and read back from. */
export const COLLISION_TYPES: Record<Exclude<CollisionValue, 0>, string> = { 1: "solid", 2: "one_way" };

export interface CollisionRect {
  x: number;
  y: number;
  width: number;
  height: number;
  value: Exclude<CollisionValue, 0>;
}

const isCollisionValue = (value: unknown): value is CollisionRect["value"] => value === 1 || value === 2;

/** The map's collision as a full width × height grid, whatever was stored (missing, short or odd values). */
export function collisionGrid(tilemap: Pick<TilemapData, "width" | "height" | "collision">): CollisionValue[][] {
  return Array.from({ length: tilemap.height }, (_, y) =>
    Array.from({ length: tilemap.width }, (_, x) => {
      const value = tilemap.collision?.[y]?.[x];
      return isCollisionValue(value) ? value : COLLISION.empty;
    })
  );
}

export function hasCollision(grid: number[][] | undefined): boolean {
  return !!grid?.some((row) => row.some(isCollisionValue));
}

/** Sets cells to a value; returns the same grid when nothing changed. */
export function paintCollision(grid: CollisionValue[][], cells: [number, number][], value: CollisionValue): CollisionValue[][] {
  const changed = cells.filter(([x, y]) => grid[y]?.[x] !== undefined && grid[y][x] !== value);
  if (!changed.length) return grid;
  const next = grid.map((row) => [...row]);
  for (const [x, y] of changed) next[y][x] = value;
  return next;
}

/** Few rectangles that cover the grid: runs along each row, stacked where the rows below repeat them. */
export function collisionRects(grid: number[][]): CollisionRect[] {
  const rects: CollisionRect[] = [];
  let open = new Map<string, CollisionRect>();
  grid.forEach((row, y) => {
    const next = new Map<string, CollisionRect>();
    for (let x = 0; x < row.length; ) {
      const value = row[x];
      let end = x + 1;
      while (end < row.length && row[end] === value) end++;
      if (isCollisionValue(value)) {
        const key = `${x}:${end}:${value}`;
        const above = open.get(key);
        if (above) above.height++;
        const rect = above ?? { x, y, width: end - x, height: 1, value };
        if (!above) rects.push(rect);
        next.set(key, rect);
      }
      x = end;
    }
    open = next;
  });
  return rects;
}

/** Marks the cells whose centre lies inside a rectangle given in tile units. */
export function collisionFromRects(rects: CollisionRect[], width: number, height: number): CollisionValue[][] {
  const grid = collisionGrid({ width, height });
  for (const rect of rects) {
    const [left, right] = [Math.ceil(rect.x - 0.5), Math.ceil(rect.x + rect.width - 0.5) - 1];
    const [top, bottom] = [Math.ceil(rect.y - 0.5), Math.ceil(rect.y + rect.height - 0.5) - 1];
    for (let y = Math.max(0, top); y <= Math.min(height - 1, bottom); y++) {
      for (let x = Math.max(0, left); x <= Math.min(width - 1, right); x++) grid[y][x] = rect.value;
    }
  }
  return grid;
}
