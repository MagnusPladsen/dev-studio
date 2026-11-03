import { v4 as uuid } from "uuid";
import type { VoxelModel } from "@/types";
import { ImportError, type Importer } from "../types";
import { assertFileSize, MAX_IMAGE_BYTES } from "../image/limits";
import { nameFromFile } from "../pixel-art/sprite-from-images";
import { encodeVoxels } from "@/lib/voxels/codec";
import { createGrid, GRID_SIZES, MAX_GRID_SIZE, voxelIndex, type Vec3, type VoxelGrid } from "@/lib/voxels/grid";

/** A MagicaVoxel model as stored: z is up, colour indices 1–255 point into `palette` (index i → palette[i - 1]). */
export interface VoxFile {
  size: Vec3;
  voxels: Uint8Array;
  palette: string[] | null;
  modelCount: number;
}

const DAMAGED = "This .vox file is damaged and can't be read.";
const CUBE_LEVELS = [0xff, 0xcc, 0x99, 0x66, 0x33, 0x00];
const RAMP_LEVELS = [0xee, 0xdd, 0xbb, 0xaa, 0x88, 0x77, 0x55, 0x44, 0x22, 0x11];

const hex = (r: number, g: number, b: number) => `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;

/** MagicaVoxel's built-in palette, used by files without an RGBA chunk: a 6×6×6 colour cube, then red, green, blue and grey ramps. */
export function defaultVoxPalette(): string[] {
  const colors: string[] = [];
  for (const r of CUBE_LEVELS) for (const g of CUBE_LEVELS) for (const b of CUBE_LEVELS) if (r || g || b) colors.push(hex(r, g, b));
  for (const level of RAMP_LEVELS) colors.push(hex(level, 0, 0));
  for (const level of RAMP_LEVELS) colors.push(hex(0, level, 0));
  for (const level of RAMP_LEVELS) colors.push(hex(0, 0, level));
  for (const level of RAMP_LEVELS) colors.push(hex(level, level, level));
  return colors;
}

function chunkId(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + 4));
}

/** Reads the first model's SIZE and XYZI chunks and the RGBA palette; other chunks (scenes, materials) are skipped. */
export function readVox(bytes: Uint8Array): VoxFile {
  if (bytes.length < 20 || chunkId(bytes, 0) !== "VOX ") throw new ImportError("This isn't a MagicaVoxel file (.vox).");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (chunkId(bytes, 8) !== "MAIN") throw new ImportError(DAMAGED);
  let size: Vec3 | null = null;
  let voxels: Uint8Array | null = null;
  let palette: string[] | null = null;
  let modelCount = 0;
  let offset = 8 + 12 + view.getInt32(12, true);
  if (offset < 20) throw new ImportError(DAMAGED);
  while (offset + 12 <= bytes.length) {
    const id = chunkId(bytes, offset);
    const contentSize = view.getInt32(offset + 4, true);
    const body = offset + 12;
    if (contentSize < 0 || body + contentSize > bytes.length) break;
    if (id === "SIZE" && contentSize >= 12) {
      modelCount++;
      if (!size) size = [view.getInt32(body, true), view.getInt32(body + 4, true), view.getInt32(body + 8, true)];
    } else if (id === "XYZI" && contentSize >= 4 && !voxels) {
      const count = Math.min(view.getInt32(body, true), (contentSize - 4) / 4);
      voxels = bytes.slice(body + 4, body + 4 + Math.max(0, count) * 4);
    } else if (id === "RGBA" && contentSize >= 1024) {
      palette = Array.from({ length: 255 }, (_, i) => hex(bytes[body + i * 4], bytes[body + i * 4 + 1], bytes[body + i * 4 + 2]));
    }
    // Child chunks follow their parent's content, so stepping over the content alone visits them too.
    offset = body + contentSize;
  }
  if (!size || !voxels) throw new ImportError(DAMAGED);
  if (size.some((side) => side < 1 || side > 2048)) throw new ImportError(DAMAGED);
  return { size, voxels, palette, modelCount };
}

/** Same voxels in the editor's grid: y is up, MagicaVoxel's y runs back to front (the inverse of `toVox`). */
function toEditorSpace(vox: VoxFile): { size: Vec3; cells: [number, number, number, number][] } {
  const [sizeX, sizeY, sizeZ] = vox.size;
  const cells: [number, number, number, number][] = [];
  for (let i = 0; i + 3 < vox.voxels.length; i += 4) {
    const [x, y, z, colorIndex] = vox.voxels.subarray(i, i + 4);
    if (colorIndex && x < sizeX && y < sizeY && z < sizeZ) cells.push([x, z, sizeY - 1 - y, colorIndex]);
  }
  return { size: [sizeX, sizeZ, sizeY], cells };
}

export interface VoxImport {
  grid: VoxelGrid;
  colors: string[];
  warnings: string[];
}

/**
 * Fits the model into one cubic editor grid (8, 16, 32 or 64): centred left/right and front/back, standing on the
 * floor. Models over 64 are shrunk by a whole factor. Only the colours in use are kept.
 */
export function voxToGrid(vox: VoxFile): VoxImport {
  const { size, cells } = toEditorSpace(vox);
  if (!cells.length) throw new ImportError("This .vox model has no cubes in it.");
  const warnings: string[] = [];
  const largest = Math.max(...size);
  const factor = Math.ceil(largest / MAX_GRID_SIZE);
  if (factor > 1) warnings.push(`The model is ${size.join("×")}; it was shrunk ${factor}× to fit the 64-cube grid`);
  const scaled = size.map((side) => Math.ceil(side / factor)) as Vec3;
  const side = GRID_SIZES.find((option) => option >= Math.max(...scaled)) ?? MAX_GRID_SIZE;
  const grid = createGrid([side, side, side]);
  const offsetX = Math.floor((side - scaled[0]) / 2);
  const offsetZ = Math.floor((side - scaled[2]) / 2);

  const palette = vox.palette ?? defaultVoxPalette();
  const values = new Map<number, number>();
  const colors: string[] = [];
  for (const [x, y, z, colorIndex] of cells) {
    let value = values.get(colorIndex);
    if (value === undefined) {
      colors.push(palette[colorIndex - 1] ?? "#808080");
      value = colors.length;
      values.set(colorIndex, value);
    }
    const index = voxelIndex(grid.size, Math.floor(x / factor) + offsetX, Math.floor(y / factor), Math.floor(z / factor) + offsetZ);
    if (!grid.data[index]) grid.data[index] = value;
  }
  if (vox.modelCount > 1) warnings.push(`This file has ${vox.modelCount} models; only the first was imported`);
  return { grid, colors, warnings };
}

export const voxImporter: Importer<VoxelModel> = {
  id: "voxels-vox",
  label: "MagicaVoxel (.vox)",
  description: "As a new model",
  accept: [".vox"],
  async parse(file) {
    assertFileSize(file, MAX_IMAGE_BYTES);
    const { grid, colors, warnings } = voxToGrid(readVox(new Uint8Array(await file.arrayBuffer())));
    const model: VoxelModel = {
      id: uuid(),
      projectId: "",
      name: nameFromFile(file.name, "Imported model"),
      size: [...grid.size],
      colors,
      voxels: encodeVoxels(grid.data),
      tags: [],
      createdAt: "",
      updatedAt: "",
    };
    return { items: [model], warnings };
  },
};
