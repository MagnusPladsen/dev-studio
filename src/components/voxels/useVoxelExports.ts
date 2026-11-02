import type { RefObject } from "react";
import type { ExportItem } from "@/components/ExportMenu";
import { downloadBlob } from "@/lib/download";
import { exportFileBase } from "@/lib/voxels/export-name";
import { toObj } from "@/lib/voxels/export-obj";
import { toVox } from "@/lib/voxels/export-vox";
import { countVoxels, type VoxelGrid } from "@/lib/voxels/grid";
import { buildMesh, greedyQuads } from "@/lib/voxels/mesh";
import type { VoxelDoc } from "./useVoxelDocument";
import type { VoxelViewportApi } from "./VoxelViewport";
import { BLENDER_MENU_DESCRIPTION, BLENDER_URL } from "./BlenderCard";

const EMPTY_DESCRIPTION = "Add some cubes first";
export const GLB_EXPORT_ERROR = "Couldn't export the .glb. Please try again.";

function buildModelMesh(grid: VoxelGrid, colors: string[]): ReturnType<typeof buildMesh> {
  return buildMesh(greedyQuads(grid), colors, grid.size);
}

async function downloadGlb(grid: VoxelGrid, colors: string[], base: string): Promise<void> {
  const { exportGlb } = await import("@/lib/voxels/export-glb");
  downloadBlob(`${base}.glb`, await exportGlb(buildModelMesh(grid, colors), base));
}

function downloadObj(grid: VoxelGrid, colors: string[], base: string): void {
  const { obj, mtl } = toObj(buildModelMesh(grid, colors), colors, base);
  downloadBlob(`${base}.obj`, new Blob([obj], { type: "text/plain" }));
  downloadBlob(`${base}.mtl`, new Blob([mtl], { type: "text/plain" }));
}

function downloadVox(grid: VoxelGrid, colors: string[], base: string): void {
  downloadBlob(`${base}.vox`, new Blob([toVox(grid, colors) as BlobPart], { type: "application/octet-stream" }));
}

async function downloadPng(getSnapshot: () => string | null, base: string): Promise<void> {
  const dataUrl = getSnapshot();
  if (!dataUrl) return;
  const blob = await (await fetch(dataUrl)).blob();
  downloadBlob(`${base}.png`, blob);
}

/** The Export menu items for the voxel editor. Mesh work only runs when an item is clicked. */
export function useVoxelExports(
  doc: Pick<VoxelDoc, "grid" | "colors" | "name"> | null,
  viewportApiRef: RefObject<VoxelViewportApi | null>,
  onError: (message: string) => void,
  /** Opens the "Render for 2D" dialog; the item is hidden when not given. */
  onRenderFor2D?: () => void,
): ExportItem[] {
  if (!doc) return [];
  const { grid, colors } = doc;
  const base = exportFileBase(doc.name);
  const isEmpty = countVoxels(grid) === 0;
  const exportGlbSafely = (): Promise<void> => downloadGlb(grid, colors, base).catch(() => onError(GLB_EXPORT_ERROR));
  const describe = (text: string): string => (isEmpty ? EMPTY_DESCRIPTION : text);
  return [
    { label: "3D model (.glb)", description: describe("For Blender, Godot, Unity and the web"), disabled: isEmpty, onClick: exportGlbSafely },
    { label: "OBJ + MTL", description: describe("Two files: the shape and its colours"), disabled: isEmpty, onClick: () => downloadObj(grid, colors, base) },
    { label: "MagicaVoxel (.vox)", description: describe("Opens in MagicaVoxel"), disabled: isEmpty, onClick: () => downloadVox(grid, colors, base) },
    { label: "Image (.png)", description: describe("The current view"), disabled: isEmpty, onClick: () => downloadPng(() => viewportApiRef.current?.snapshotPng() ?? null, base) },
    ...(onRenderFor2D
      ? [
          {
            label: "Render for 2D…",
            description: describe("Pixel sprites from 1, 4 or 8 directions, a sprite sheet or a turntable GIF"),
            disabled: isEmpty,
            onClick: onRenderFor2D,
          },
        ]
      : []),
    {
      label: "Open in Blender (free)",
      description: BLENDER_MENU_DESCRIPTION,
      onClick: () => void window.open(BLENDER_URL, "_blank", "noopener,noreferrer"),
    },
  ];
}
