import type { Sprite } from "@/types";
import type { Importer } from "../types";
import { browserImageCodec, type ImageCodec } from "../image/codec";
import { buildSprite, DEFAULT_FRAME_MS, DEFAULT_PIXEL_IMPORT, nameFromFile, prepareFrames, type PixelImportOptions } from "./sprite-from-images";

export const STILL_IMAGE_ACCEPT = [".png", ".jpg", ".jpeg", ".webp", "image/png", "image/jpeg", "image/webp"];

/** A PNG, JPG or WebP picture as a one-frame sprite (or, with `options.canvas`, as a layer for the open sprite). */
export function pixelImageImporter(options: PixelImportOptions = DEFAULT_PIXEL_IMPORT, codec: ImageCodec = browserImageCodec): Importer<Sprite> {
  return {
    id: "pixel-image",
    label: "Image (.png, .jpg, .webp)",
    description: "As a new sprite, or a layer in this one",
    accept: STILL_IMAGE_ACCEPT,
    async parse(file) {
      const image = await codec.decode(file);
      const { frames, warnings } = prepareFrames([image], file.name, options);
      const [frame] = frames;
      const sprite = buildSprite(nameFromFile(file.name, "Imported sprite"), frame.width, frame.height, [{ pixels: codec.encode(frame), duration: DEFAULT_FRAME_MS }]);
      return { items: [sprite], warnings };
    },
  };
}
