import type { VoxelModel } from "@/types";
import type { Importer } from "@/lib/import";
import { voxImporter } from "./vox";

/** What 3D Pixel Art's Import menu offers, in menu order. Add an importer here to offer a new format. */
export const VOXEL_IMPORTERS: Importer<VoxelModel>[] = [voxImporter];
