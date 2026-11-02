import { createGrid, inBounds, voxelIndex, type Vec3, type VoxelGrid } from "./grid";

/** An inclusive box of cells: min and max are both inside it. */
export interface SelectionBox {
  min: Vec3;
  max: Vec3;
}

export type Axis = 0 | 1 | 2;

export function normalizeBox(a: Vec3, b: Vec3): SelectionBox {
  return {
    min: [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])],
    max: [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])],
  };
}

export function boxSize(box: SelectionBox): Vec3 {
  return [box.max[0] - box.min[0] + 1, box.max[1] - box.min[1] + 1, box.max[2] - box.min[2] + 1];
}

export function boxAt(min: Vec3, size: Vec3): SelectionBox {
  return { min: [...min], max: [min[0] + size[0] - 1, min[1] + size[1] - 1, min[2] + size[2] - 1] };
}

/** Clamps the box to the grid; null when nothing of it is inside. */
export function clampBox(box: SelectionBox, size: Vec3): SelectionBox | null {
  const min = box.min.map((v) => Math.max(0, v)) as Vec3;
  const max = box.max.map((v, axis) => Math.min(size[axis] - 1, v)) as Vec3;
  return min.every((v, axis) => v <= max[axis]) ? { min, max } : null;
}

/** The smallest box around every filled cell, or null for an empty grid. */
export function boundsOfFilled(grid: VoxelGrid): SelectionBox | null {
  const [sx, sy, sz] = grid.size;
  let box: SelectionBox | null = null;
  for (let z = 0; z < sz; z++) {
    for (let y = 0; y < sy; y++) {
      for (let x = 0; x < sx; x++) {
        if (!grid.data[voxelIndex(grid.size, x, y, z)]) continue;
        if (!box) box = { min: [x, y, z], max: [x, y, z] };
        else {
          box.min = [Math.min(box.min[0], x), Math.min(box.min[1], y), Math.min(box.min[2], z)];
          box.max = [Math.max(box.max[0], x), Math.max(box.max[1], y), Math.max(box.max[2], z)];
        }
      }
    }
  }
  return box;
}

/** The cells inside the box, as a small grid of the box's size. */
export function copyRegion(grid: VoxelGrid, box: SelectionBox): VoxelGrid {
  const clip = createGrid(boxSize(box));
  const [cx, cy, cz] = clip.size;
  for (let z = 0; z < cz; z++) {
    for (let y = 0; y < cy; y++) {
      for (let x = 0; x < cx; x++) {
        const gx = box.min[0] + x, gy = box.min[1] + y, gz = box.min[2] + z;
        if (!inBounds(grid.size, gx, gy, gz)) continue;
        clip.data[voxelIndex(clip.size, x, y, z)] = grid.data[voxelIndex(grid.size, gx, gy, gz)];
      }
    }
  }
  return clip;
}

export function clearRegion(grid: VoxelGrid, box: SelectionBox): VoxelGrid {
  const next: VoxelGrid = { size: grid.size, data: grid.data.slice() };
  for (let z = box.min[2]; z <= box.max[2]; z++) {
    for (let y = box.min[1]; y <= box.max[1]; y++) {
      for (let x = box.min[0]; x <= box.max[0]; x++) {
        if (inBounds(grid.size, x, y, z)) next.data[voxelIndex(grid.size, x, y, z)] = 0;
      }
    }
  }
  return next;
}

/** Stamps the clip's filled cells with its corner at `at`. Empty clip cells leave the grid as it was. */
export function pasteClip(grid: VoxelGrid, clip: VoxelGrid, at: Vec3): VoxelGrid {
  const next: VoxelGrid = { size: grid.size, data: grid.data.slice() };
  const [cx, cy, cz] = clip.size;
  for (let z = 0; z < cz; z++) {
    for (let y = 0; y < cy; y++) {
      for (let x = 0; x < cx; x++) {
        const value = clip.data[voxelIndex(clip.size, x, y, z)];
        const gx = at[0] + x, gy = at[1] + y, gz = at[2] + z;
        if (value && inBounds(grid.size, gx, gy, gz)) next.data[voxelIndex(grid.size, gx, gy, gz)] = value;
      }
    }
  }
  return next;
}

/** Turns the clip a quarter turn around the axis (0 = X, 1 = Y, 2 = Z). */
export function rotateClip(clip: VoxelGrid, axis: Axis): VoxelGrid {
  const [sx, sy, sz] = clip.size;
  const size: Vec3 = axis === 0 ? [sx, sz, sy] : axis === 1 ? [sz, sy, sx] : [sy, sx, sz];
  const out = createGrid(size);
  for (let z = 0; z < sz; z++) {
    for (let y = 0; y < sy; y++) {
      for (let x = 0; x < sx; x++) {
        const value = clip.data[voxelIndex(clip.size, x, y, z)];
        if (!value) continue;
        const target: Vec3 =
          axis === 0 ? [x, z, sy - 1 - y] : axis === 1 ? [z, y, sx - 1 - x] : [y, sx - 1 - x, z];
        out.data[voxelIndex(size, ...target)] = value;
      }
    }
  }
  return out;
}

export function flipClip(clip: VoxelGrid, axis: Axis): VoxelGrid {
  const out = createGrid([...clip.size]);
  const [sx, sy, sz] = clip.size;
  for (let z = 0; z < sz; z++) {
    for (let y = 0; y < sy; y++) {
      for (let x = 0; x < sx; x++) {
        const target: Vec3 = [x, y, z];
        target[axis] = clip.size[axis] - 1 - target[axis];
        out.data[voxelIndex(clip.size, ...target)] = clip.data[voxelIndex(clip.size, x, y, z)];
      }
    }
  }
  return out;
}

/**
 * The part of `delta` the box can move without leaving the grid, per axis.
 * `clamped` tells the caller some of the move was refused.
 */
export function clampMove(box: SelectionBox, delta: Vec3, size: Vec3): { delta: Vec3; clamped: boolean } {
  const allowed = delta.map((d, axis) => {
    const lowest = -box.min[axis];
    const highest = size[axis] - 1 - box.max[axis];
    return Math.max(lowest, Math.min(highest, d)) + 0; // + 0 turns -0 into 0
  }) as Vec3;
  return { delta: allowed, clamped: allowed.some((d, axis) => d !== delta[axis]) };
}

/** Moves a box of the given size so it fits inside the grid, keeping it as close to `min` as possible. */
export function fitBox(min: Vec3, boxDims: Vec3, size: Vec3): SelectionBox {
  const fitted = min.map((v, axis) => Math.max(0, Math.min(v, size[axis] - boxDims[axis]))) as Vec3;
  return boxAt(fitted, boxDims);
}
