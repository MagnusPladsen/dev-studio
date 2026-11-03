import type { Palette } from "@/types";
import { ImportError, type Importer } from "../types";
import { assertFileSize, MAX_TEXT_BYTES } from "../image/limits";
import { buildPalette, toHex, type PaletteContents } from "./palette-file";

const COLOR_ENTRY = 0x0001;
const GROUP_START = 0xc001;
const DAMAGED = "This swatch file is damaged and can't be read.";

function readName(view: DataView, offset: number): { name: string; next: number } {
  const length = view.getUint16(offset);
  let name = "";
  for (let i = 0; i < length; i++) {
    const code = view.getUint16(offset + 2 + i * 2);
    if (code) name += String.fromCharCode(code);
  }
  return { name, next: offset + 2 + length * 2 };
}

function readColor(view: DataView, offset: number): string | null {
  const model = String.fromCharCode(...[0, 1, 2, 3].map((i) => view.getUint8(offset + i)));
  const channel = (i: number) => view.getFloat32(offset + 4 + i * 4) * 255;
  if (model === "RGB ") return toHex(channel(0), channel(1), channel(2));
  if (model === "Gray") return toHex(channel(0), channel(0), channel(0));
  return null;
}

/** Adobe Swatch Exchange: RGB and grey swatches. CMYK and Lab ones need colour profiles, so they are skipped. */
export function readAse(bytes: Uint8Array): PaletteContents {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 12 || String.fromCharCode(...bytes.subarray(0, 4)) !== "ASEF") throw new ImportError("This isn't an Adobe swatch file (.ase).");
  const blockCount = view.getUint32(8);
  const colors: string[] = [];
  let name: string | undefined;
  let unsupported = 0;
  let offset = 12;
  try {
    for (let block = 0; block < blockCount; block++) {
      const type = view.getUint16(offset);
      const length = view.getUint32(offset + 2);
      const body = offset + 6;
      if (body + length > bytes.length) throw new RangeError("block past the end");
      if (type === GROUP_START && name === undefined) name = readName(view, body).name;
      if (type === COLOR_ENTRY) {
        const color = readColor(view, readName(view, body).next);
        if (color) colors.push(color);
        else unsupported++;
      }
      offset = body + length;
    }
  } catch (error) {
    if (error instanceof RangeError && colors.length === 0) throw new ImportError(DAMAGED);
    if (!(error instanceof RangeError)) throw error;
  }
  if (!colors.length && unsupported) throw new ImportError("This swatch file only has CMYK or Lab colours. Save it with RGB swatches and try again.");
  const warnings = unsupported ? [`Skipped ${unsupported} CMYK or Lab ${unsupported === 1 ? "swatch" : "swatches"}; only RGB and grey are read`] : [];
  return { name, colors, warnings };
}

export const aseImporter: Importer<Palette> = {
  id: "palette-ase",
  label: "Adobe swatches (.ase)",
  description: "RGB swatches from Photoshop, Illustrator or Procreate",
  accept: [".ase"],
  async parse(file) {
    assertFileSize(file, MAX_TEXT_BYTES);
    return buildPalette(file.name, readAse(new Uint8Array(await file.arrayBuffer())));
  },
};
