import type { RayHit } from "@/lib/voxels/raycast";

export type VoxelTool = "add" | "erase" | "paint" | "pick" | "fill" | "box" | "select";

/** "3d" edits in the 3D view; "slice" edits one flat layer at a time, like a pixel-art canvas. */
export type EditView = "3d" | "slice";

export type ViewPreset = "reset" | "front" | "side" | "top";

export interface StrokeEvent {
  phase: "start" | "move" | "end" | "cancel";
  hit: RayHit | null;
  shiftKey: boolean;
}
