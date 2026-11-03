import { v4 as uuid } from "uuid";
import type { SoundEffect } from "@/types";
import { ImportError, type Importer } from "@/lib/import/types";
import { assertFileSize } from "@/lib/import/file-size";
import { decodeSfxrB58, isSfxrObject, readSfxrObject, type SfxrParams } from "./sfxr-params";
import { sfxrToParams } from "./sfxr-convert";

const MAX_BYTES = 256 * 1024;
const NOT_SFXR = "This isn't an sfxr sound. Use a jsfxr JSON file, or a text file with a b58 code or an sfxr.me link.";

/** The settings in a file: a jsfxr JSON object (or an array of them), else one b58 code or link per line. */
function readSettings(text: string): SfxrParams[] {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    const data: unknown = JSON.parse(trimmed);
    const list = Array.isArray(data) ? data : [data];
    if (list.length === 0 || !list.every(isSfxrObject)) throw new ImportError(NOT_SFXR);
    return list.map(readSfxrObject);
  }
  const lines = trimmed.split(/\s+/).filter(Boolean);
  if (lines.length === 0) throw new ImportError(NOT_SFXR);
  return lines.map(decodeSfxrB58);
}

function looksLikeSfxr(text: string): boolean {
  try {
    return readSettings(text).length > 0;
  } catch {
    return false;
  }
}

const fileStem = (name: string) => name.replace(/\.[^.]+$/, "") || "sfxr sound";

/** jsfxr / sfxr.me settings (JSON, b58 codes or links) as new sounds. */
export const sfxrImporter: Importer<SoundEffect> = {
  id: "sfxr",
  label: "sfxr / jsfxr sound (.json, .txt)",
  description: "jsfxr JSON, a b58 code or an sfxr.me link, as new sounds",
  accept: [".json", ".txt", "application/json", "text/plain"],
  detect: (_file, text) => looksLikeSfxr(text),
  async parse(file) {
    assertFileSize(file, MAX_BYTES);
    const settings = readSettings(await file.text());
    const warnings = new Set<string>();
    const now = new Date().toISOString();
    const stem = fileStem(file.name);
    const items = settings.map((sfxr, index): SoundEffect => {
      const converted = sfxrToParams(sfxr);
      converted.warnings.forEach((warning) => warnings.add(warning));
      const name = settings.length > 1 ? `${stem} ${index + 1}` : stem;
      return { id: uuid(), projectId: "", name, params: converted.params, tags: ["sfxr"], createdAt: now, updatedAt: now };
    });
    return { items, warnings: [...warnings] };
  },
};
