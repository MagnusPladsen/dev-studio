import type { Importer } from "../types";
import type { TilemapImport } from "./tiled-model";
import { tiledImporter } from "./tiled";

export type { TilemapImport } from "./tiled-model";

export const TILEMAP_IMPORTERS: Importer<TilemapImport>[] = [tiledImporter];
