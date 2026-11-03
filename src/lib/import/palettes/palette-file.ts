import { v4 as uuid } from "uuid";
import type { Palette } from "@/types";
import { ImportError, type ImportResult, type Importer } from "../types";
import { assertFileSize, MAX_TEXT_BYTES } from "../image/limits";
import { nameFromFile } from "../pixel-art/sprite-from-images";

export const MAX_PALETTE_COLORS = 256;

export function toHex(red: number, green: number, blue: number): string {
  return `#${[red, green, blue].map((channel) => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, "0")).join("")}`;
}

/** What a palette file holds; `name` is left out when the file has none and the file name is used. */
export interface PaletteContents {
  name?: string;
  colors: string[];
  warnings?: string[];
}

/** A new palette (fresh id); `saveImportedAssets` fills in the project and timestamps. */
export function buildPalette(fileName: string, contents: PaletteContents): ImportResult<Palette> {
  if (!contents.colors.length) throw new ImportError("This palette file has no colours in it.");
  const warnings = [...(contents.warnings ?? [])];
  let colors = contents.colors;
  if (colors.length > MAX_PALETTE_COLORS) {
    warnings.push(`Kept the first ${MAX_PALETTE_COLORS} of ${colors.length} colours`);
    colors = colors.slice(0, MAX_PALETTE_COLORS);
  }
  const name = contents.name?.trim() || nameFromFile(fileName, "Imported palette");
  return { items: [{ id: uuid(), projectId: "", name, colors, createdAt: "" }], warnings };
}

interface TextPaletteFormat {
  id: string;
  label: string;
  description: string;
  accept: string[];
  detect?(text: string): boolean;
  read(text: string): PaletteContents;
}

/** An importer for a text palette format: size cap, then `read`, then the palette. */
export function textPaletteImporter(format: TextPaletteFormat): Importer<Palette> {
  const { id, label, description, accept, detect, read } = format;
  return {
    id,
    label,
    description,
    accept,
    detect: detect ? (_file, text) => detect(text) : undefined,
    async parse(file) {
      assertFileSize(file, MAX_TEXT_BYTES);
      return buildPalette(file.name, read(await file.text()));
    },
  };
}

export function lines(text: string): string[] {
  return text.replace(/^﻿/, "").split(/\r?\n/).map((line) => line.trim());
}

/** "#ff8800", "ff8800" or "f80" as a colour, else null. */
export function parseHexColor(value: string): string | null {
  const hex = value.trim().replace(/^#|^0x/i, "");
  if (/^[0-9a-f]{6}$/i.test(hex)) return `#${hex.toLowerCase()}`;
  if (/^[0-9a-f]{3}$/i.test(hex)) return `#${[...hex.toLowerCase()].map((c) => c + c).join("")}`;
  return null;
}

export function skippedLines(count: number): string[] {
  return count ? [`Skipped ${count} ${count === 1 ? "line that wasn't a colour" : "lines that weren't colours"}`] : [];
}
