import type { Vec3, VoxelGrid } from "./grid";

/** Camera height above the model, in degrees. */
export const ELEVATIONS = {
  side: { degrees: 0, label: "Side" },
  iso: { degrees: 30, label: "Isometric" },
  top: { degrees: 60, label: "Top-down" },
} as const;
export type ElevationKey = keyof typeof ELEVATIONS;

export const DIRECTION_COUNTS = [1, 4, 8] as const;
export type DirectionCount = (typeof DIRECTION_COUNTS)[number];

export const FRAME_SIZES = [16, 32, 48, 64, 96, 128] as const;
export const TURNTABLE_FRAMES = [12, 24, 36] as const;

export interface Direction {
  /** Degrees around the vertical axis; 0 looks at the model's front (+Z). */
  yaw: number;
  label: string;
}

const EIGHT_LABELS = ["Front", "Front-right", "Right", "Back-right", "Back", "Back-left", "Left", "Front-left"];

/** Camera directions in sprite order: front first, then turning clockwise as seen from above. */
export function directions(count: DirectionCount): Direction[] {
  const step = 360 / count;
  return Array.from({ length: count }, (_, i) => ({
    yaw: i * step,
    label: EIGHT_LABELS[(i * 8) / count],
  }));
}

/** Evenly spaced angles for a full turn, starting at the front. */
export function turntableYaws(frames: number): number[] {
  return Array.from({ length: frames }, (_, i) => (i * 360) / frames);
}

const rad = (deg: number) => (deg * Math.PI) / 180;

export interface CameraBasis {
  /** Unit vector from the model's origin towards the camera. */
  toCamera: Vec3;
  right: Vec3;
  up: Vec3;
}

/** The camera's axes for a yaw and elevation, matching three.js `lookAt` towards the origin. */
export function cameraBasis(yawDeg: number, elevationDeg: number): CameraBasis {
  const y = rad(yawDeg);
  const e = rad(elevationDeg);
  const c = Math.cos(e);
  const s = Math.sin(e);
  return {
    toCamera: [c * Math.sin(y), s, c * Math.cos(y)],
    right: [Math.cos(y), 0, -Math.sin(y)],
    up: [-s * Math.sin(y), c, -s * Math.cos(y)],
  };
}

/** The filled part of the grid, in the mesh's coordinates (x/z centred, y from the floor). */
export function occupiedBounds(grid: VoxelGrid): { min: Vec3; max: Vec3 } | null {
  const [sx, sy, sz] = grid.size;
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (let z = 0; z < sz; z++) {
    for (let yy = 0; yy < sy; yy++) {
      for (let x = 0; x < sx; x++) {
        if (!grid.data[x + yy * sx + z * sx * sy]) continue;
        min[0] = Math.min(min[0], x);
        min[1] = Math.min(min[1], yy);
        min[2] = Math.min(min[2], z);
        max[0] = Math.max(max[0], x + 1);
        max[1] = Math.max(max[1], yy + 1);
        max[2] = Math.max(max[2], z + 1);
      }
    }
  }
  if (min[0] === Infinity) return null;
  return {
    min: [min[0] - sx / 2, min[1], min[2] - sz / 2],
    max: [max[0] - sx / 2, max[1], max[2] - sz / 2],
  };
}

export interface OrthoFrame {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * One square camera window that fits the model from every given yaw, so all frames share the
 * same scale and the model doesn't jump around between directions. `padPixels` leaves room for
 * the outline at the given frame size.
 */
export function fitFrame(
  bounds: { min: Vec3; max: Vec3 },
  yaws: number[],
  elevationDeg: number,
  framePixels: number,
  padPixels = 1.5
): OrthoFrame {
  let left = Infinity, right = -Infinity, bottom = Infinity, top = -Infinity;
  for (const yaw of yaws) {
    const { right: r, up: u } = cameraBasis(yaw, elevationDeg);
    for (const x of [bounds.min[0], bounds.max[0]]) {
      for (const y of [bounds.min[1], bounds.max[1]]) {
        for (const z of [bounds.min[2], bounds.max[2]]) {
          const p: Vec3 = [x, y, z];
          const px = dot(p, r);
          const py = dot(p, u);
          left = Math.min(left, px);
          right = Math.max(right, px);
          bottom = Math.min(bottom, py);
          top = Math.max(top, py);
        }
      }
    }
  }
  const cx = (left + right) / 2;
  const cy = (bottom + top) / 2;
  const half = Math.max(right - left, top - bottom) / 2;
  // grow the window so `padPixels` of empty space is left on each side
  const padded = half * (framePixels / Math.max(1, framePixels - 2 * padPixels));
  return { left: cx - padded, right: cx + padded, top: cy + padded, bottom: cy - padded };
}

/** Hard edges: alpha becomes fully on or off, and see-through pixels lose their colour. */
export function crispAlpha(data: Uint8ClampedArray): void {
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] >= 128) data[i + 3] = 255;
    else data[i] = data[i + 1] = data[i + 2] = data[i + 3] = 0;
  }
}

/** Draws a 1-pixel outline around the opaque shape, on the empty pixels next to it. */
export function addOutline(data: Uint8ClampedArray, width: number, height: number, rgb: [number, number, number]): void {
  const opaque = new Uint8Array(width * height);
  for (let p = 0; p < opaque.length; p++) opaque[p] = data[p * 4 + 3] >= 128 ? 1 : 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      if (opaque[p]) continue;
      const touches =
        (x > 0 && opaque[p - 1]) ||
        (x < width - 1 && opaque[p + 1]) ||
        (y > 0 && opaque[p - width]) ||
        (y < height - 1 && opaque[p + width]);
      if (!touches) continue;
      data[p * 4] = rgb[0];
      data[p * 4 + 1] = rgb[1];
      data[p * 4 + 2] = rgb[2];
      data[p * 4 + 3] = 255;
    }
  }
}

/** Sprite name for a set of directional renders. */
export function renderSpriteName(modelName: string, count: DirectionCount): string {
  const base = modelName.trim() || "Untitled model";
  return count === 1 ? `${base} (render)` : `${base} (${count} directions)`;
}
