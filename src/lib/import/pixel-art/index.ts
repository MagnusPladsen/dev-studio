import type { Sprite } from "@/types";
import type { Importer } from "@/lib/import";
import type { ImageCodec } from "../image/codec";
import { pixelGifImporter } from "./gif";
import { pixelImageImporter } from "./image";
import type { PixelImportOptions } from "./sprite-from-images";

export { DEFAULT_PIXEL_IMPORT, MAX_SPRITE_SIZE, type PixelImportOptions } from "./sprite-from-images";

/** Pixel Art's importers with the choices made in its import dialog. */
export function pixelArtImporters(options?: PixelImportOptions, codec?: ImageCodec): Importer<Sprite>[] {
  return [pixelImageImporter(options, codec), pixelGifImporter(options, codec)];
}

/** What Pixel Art's Import menu offers, in menu order. Add an importer here to offer a new format. */
export const PIXEL_ART_IMPORTERS: Importer<Sprite>[] = pixelArtImporters();
