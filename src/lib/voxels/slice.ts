import { getVoxel, type Vec3, type VoxelGrid } from "./grid";
import { normalizeBox, type SelectionBox } from "./selection";

/**
 * One flat layer of a model, drawn like a pixel-art canvas.
 * "y" = Top (looking down), "z" = Front, "x" = Side. Columns and rows match what the
 * matching 3D camera preset shows, so the slice and the 3D view agree on left/right and up/down.
 */
export type SliceAxis = "x" | "y" | "z";

export const SLICE_AXES: { axis: SliceAxis; label: string; layerName: string }[] = [
  { axis: "y", label: "Top", layerName: "Height" },
  { axis: "z", label: "Front", layerName: "Depth" },
  { axis: "x", label: "Side", layerName: "Width" },
];

export const AXIS_INDEX: Record<SliceAxis, 0 | 1 | 2> = { x: 0, y: 1, z: 2 };

export type SlicePoint = [col: number, row: number];

/** Width and height of a slice, in cells. */
export function sliceDims(size: Vec3, axis: SliceAxis): [cols: number, rows: number] {
  if (axis === "y") return [size[0], size[2]];
  if (axis === "z") return [size[0], size[1]];
  return [size[2], size[1]];
}

export function layerCount(size: Vec3, axis: SliceAxis): number {
  return size[AXIS_INDEX[axis]];
}

export function sliceToCell(size: Vec3, axis: SliceAxis, layer: number, [col, row]: SlicePoint): Vec3 {
  if (axis === "y") return [col, layer, row];
  if (axis === "z") return [col, size[1] - 1 - row, layer];
  return [layer, size[1] - 1 - row, size[2] - 1 - col];
}

export function cellToSlice(size: Vec3, axis: SliceAxis, [x, y, z]: Vec3): { layer: number; point: SlicePoint } {
  if (axis === "y") return { layer: y, point: [x, z] };
  if (axis === "z") return { layer: z, point: [x, size[1] - 1 - y] };
  return { layer: x, point: [size[2] - 1 - z, size[1] - 1 - y] };
}

export function inSlice(size: Vec3, axis: SliceAxis, [col, row]: SlicePoint): boolean {
  const [cols, rows] = sliceDims(size, axis);
  return col >= 0 && row >= 0 && col < cols && row < rows;
}

/** Every cell of a rectangle on one layer. */
export function sliceRectCells(size: Vec3, axis: SliceAxis, layer: number, a: SlicePoint, b: SlicePoint): Vec3[] {
  const cells: Vec3[] = [];
  for (let row = Math.min(a[1], b[1]); row <= Math.max(a[1], b[1]); row++) {
    for (let col = Math.min(a[0], b[0]); col <= Math.max(a[0], b[0]); col++) {
      if (inSlice(size, axis, [col, row])) cells.push(sliceToCell(size, axis, layer, [col, row]));
    }
  }
  return cells;
}

/** A selection box from a rectangle on the slice: just this layer, or through every layer. */
export function sliceRectBox(
  size: Vec3,
  axis: SliceAxis,
  layer: number,
  a: SlicePoint,
  b: SlicePoint,
  allLayers: boolean
): SelectionBox {
  const index = AXIS_INDEX[axis];
  const box = normalizeBox(sliceToCell(size, axis, layer, a), sliceToCell(size, axis, layer, b));
  if (allLayers) {
    box.min[index] = 0;
    box.max[index] = size[index] - 1;
  }
  return box;
}

/** Same-colour cells connected to the start cell on this layer (4 neighbours), for the fill tool. */
export function sliceFloodCells(grid: VoxelGrid, axis: SliceAxis, layer: number, start: SlicePoint): Vec3[] {
  const { size } = grid;
  if (!inSlice(size, axis, start)) return [];
  const target = getVoxel(grid, ...sliceToCell(size, axis, layer, start));
  const seen = new Set<string>([start.join(",")]);
  const queue: SlicePoint[] = [start];
  const cells: Vec3[] = [];
  while (queue.length) {
    const point = queue.pop() as SlicePoint;
    cells.push(sliceToCell(size, axis, layer, point));
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const next: SlicePoint = [point[0] + dc, point[1] + dr];
      const key = next.join(",");
      if (seen.has(key) || !inSlice(size, axis, next)) continue;
      seen.add(key);
      if (getVoxel(grid, ...sliceToCell(size, axis, layer, next)) === target) queue.push(next);
    }
  }
  return cells;
}
