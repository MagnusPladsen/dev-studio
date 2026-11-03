import { ImportError } from "../types";
import { parseHexColor, textPaletteImporter, type PaletteContents } from "./palette-file";

const LOSPEC_HOSTS = new Set(["lospec.com", "www.lospec.com"]);
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * The Lospec palette slug for what someone typed: a name ("Endesga 32"), a slug ("endesga-32") or a lospec.com
 * palette URL. Null for anything else, including URLs on other sites.
 */
export function lospecSlug(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  if (/^(https?:\/\/|www\.|lospec\.com)/i.test(text)) {
    let url: URL;
    try {
      url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    } catch {
      return null;
    }
    if (!LOSPEC_HOSTS.has(url.hostname.toLowerCase())) return null;
    const match = /^\/palette-list\/([^/]+?)(?:\.\w+)?\/?$/.exec(url.pathname);
    return match && SLUG.test(match[1].toLowerCase()) ? match[1].toLowerCase() : null;
  }
  const slug = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return SLUG.test(slug) ? slug : null;
}

export function lospecJsonUrl(slug: string): string {
  return `https://lospec.com/palette-list/${slug}.json`;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

function readLospec(text: string): PaletteContents {
  const data: unknown = JSON.parse(text);
  if (!isRecord(data) || !Array.isArray(data.colors)) throw new ImportError("This isn't a Lospec palette file.");
  const colors = data.colors.map((color) => (typeof color === "string" ? parseHexColor(color) : null));
  const skipped = colors.filter((color) => !color).length;
  const author = typeof data.author === "string" && data.author.trim() ? data.author.trim() : null;
  const name = typeof data.name === "string" ? data.name : undefined;
  return {
    name: name && author ? `${name} by ${author}` : name,
    colors: colors.filter((color): color is string => Boolean(color)),
    warnings: skipped ? [`Skipped ${skipped} entries that weren't colours`] : [],
  };
}

/** Lospec's palette JSON: what "Lospec palette…" downloads, or a .json saved from lospec.com. */
export const lospecJsonImporter = textPaletteImporter({
  id: "palette-lospec-json",
  label: "Lospec palette (.json)",
  description: "Saved from lospec.com",
  accept: [".json", "application/json"],
  detect(text) {
    try {
      return Array.isArray((JSON.parse(text) as { colors?: unknown }).colors);
    } catch {
      return false;
    }
  },
  read: readLospec,
});
