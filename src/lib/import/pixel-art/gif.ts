import type { Sprite } from "@/types";
import type { Importer } from "../types";
import { browserImageCodec, type ImageCodec } from "../image/codec";
import { readGif } from "../image/gif-reader";
import { assertFileSize, MAX_IMAGE_BYTES } from "../image/limits";
import { buildSprite, DEFAULT_PIXEL_IMPORT, nameFromFile, prepareFrames, type PixelImportOptions } from "./sprite-from-images";

/** An animated (or still) GIF: every frame becomes a sprite frame, each keeping its own delay. */
export function pixelGifImporter(options: PixelImportOptions = DEFAULT_PIXEL_IMPORT, codec: ImageCodec = browserImageCodec): Importer<Sprite> {
  return {
    id: "pixel-gif",
    label: "Animated GIF (.gif)",
    description: "Every frame becomes a sprite frame",
    accept: [".gif", "image/gif"],
    async parse(file) {
      assertFileSize(file, MAX_IMAGE_BYTES);
      const gif = readGif(new Uint8Array(await file.arrayBuffer()));
      const { frames, warnings } = prepareFrames(gif.frames.map((frame) => frame.image), file.name, options);
      const delays = gif.frames.map((frame) => frame.delay);
      const sprite = buildSprite(
        nameFromFile(file.name, "Imported animation"),
        frames[0].width,
        frames[0].height,
        frames.map((frame, i) => ({ pixels: codec.encode(frame), duration: delays[i] }))
      );
      if (frames.length > 1 && new Set(delays).size > 1) {
        warnings.push(`Frame delays differ; each frame keeps its own for GIF export, and the preview plays at ${sprite.fps} fps`);
      }
      return { items: [sprite], warnings };
    },
  };
}
