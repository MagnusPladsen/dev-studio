import { acceptsFile } from "../run";
import { assertFileSize } from "../file-size";
import { browserImageCodec, type ImageCodec } from "../image/codec";
import { ImportError, MissingFilesError, type ImportResult, type Importer } from "../types";
import { buildTilemapImport } from "./build";
import type { TiledMap, TilemapImport } from "./tiled-model";
import { isTiledJsonTileset, readTiledJsonMap } from "./tiled-json";
import { readTmx } from "./tiled-xml";
import { MAX_TILED_FILE_BYTES } from "./tilesets";

const MAP_ACCEPT = [".tmj", ".tmx", ".json", "application/json"];
const COMPANIONS = [".tsx", ".tsj", ".png", ".gif", ".jpg", ".jpeg", ".webp", ".bmp", "image/*"];

const isXml = (text: string) => text.trimStart().startsWith("<");

/** Is this text a tileset (picked along with its map) rather than a map? */
function isTileset(text: string): boolean {
  if (isXml(text)) return /^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<tileset[\s>]/.test(text);
  try {
    return isTiledJsonTileset(JSON.parse(text));
  } catch {
    return false;
  }
}

async function readMap(text: string): Promise<TiledMap> {
  return isXml(text) ? readTmx(text) : readTiledJsonMap(JSON.parse(text));
}

/** The maps among the files; the rest (tilesets, images) are what the maps refer to. */
async function findMaps(files: File[]): Promise<{ file: File; text: string }[]> {
  const maps: { file: File; text: string }[] = [];
  for (const file of files.filter((candidate) => acceptsFile(MAP_ACCEPT, candidate))) {
    assertFileSize(file, MAX_TILED_FILE_BYTES);
    const text = await file.text();
    if (!isTileset(text)) maps.push({ file, text });
  }
  if (maps.length === 0) throw new ImportError("Add a Tiled map (.tmj or .tmx) along with its tilesets and images.");
  return maps;
}

/**
 * Tiled maps, JSON (.tmj, and the Tilemap's own JSON export) or XML (.tmx), picked or dropped together with their
 * external tilesets and images. `codec` is swapped in tests.
 */
export function createTiledImporter(codec: ImageCodec = browserImageCodec): Importer<TilemapImport> {
  const parseFiles = async (files: File[], options = { skipMissing: false }): Promise<ImportResult<TilemapImport>> => {
    const result: ImportResult<TilemapImport> = { items: [], warnings: [] };
    const missing = new Set<string>();
    for (const { file, text } of await findMaps(files)) {
      try {
        const map = await buildTilemapImport(await readMap(text), file.name, { files, skipMissing: options.skipMissing, codec });
        result.items.push(...map.items);
        result.warnings.push(...map.warnings);
      } catch (error) {
        if (!(error instanceof MissingFilesError)) throw error;
        error.names.forEach((name) => missing.add(name));
      }
    }
    if (missing.size) throw new MissingFilesError([...missing]);
    return result;
  };
  return {
    id: "tiled",
    label: "Tiled map (.tmj, .tmx, .json)",
    description: "Orthogonal maps; pick their tilesets and images too",
    accept: MAP_ACCEPT,
    companions: COMPANIONS,
    pick: "many",
    parse: (file) => parseFiles([file]),
    parseFiles,
  };
}

export const tiledImporter = createTiledImporter();
