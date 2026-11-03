import { ImportError } from "../types";
import { lines, parseHexColor, skippedLines, textPaletteImporter, toHex, type PaletteContents } from "./palette-file";

function readGpl(text: string): PaletteContents {
  const all = lines(text);
  if (all[0] !== "GIMP Palette") throw new ImportError("This isn't a GIMP palette: the first line should say \"GIMP Palette\".");
  let name: string | undefined;
  let skipped = 0;
  const colors: string[] = [];
  for (const line of all.slice(1)) {
    if (!line || line.startsWith("#") || /^Columns:/i.test(line)) continue;
    const nameMatch = /^Name:\s*(.*)$/i.exec(line);
    if (nameMatch) {
      name = nameMatch[1];
      continue;
    }
    const rgb = /^(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})\b/.exec(line);
    if (rgb) colors.push(toHex(+rgb[1], +rgb[2], +rgb[3]));
    else skipped++;
  }
  return { name, colors, warnings: skippedLines(skipped) };
}

function readJascPal(text: string): PaletteContents {
  const all = lines(text).filter(Boolean);
  if (all[0] !== "JASC-PAL") throw new ImportError("This isn't a JASC palette: the first line should say \"JASC-PAL\".");
  const count = Number(all[2]);
  let skipped = 0;
  const colors: string[] = [];
  for (const line of all.slice(3)) {
    const rgb = /^(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})$/.exec(line);
    if (rgb) colors.push(toHex(+rgb[1], +rgb[2], +rgb[3]));
    else skipped++;
  }
  const warnings = skippedLines(skipped);
  if (Number.isInteger(count) && count !== colors.length) warnings.push(`The file says ${count} colours but has ${colors.length}`);
  return { colors, warnings };
}

/** One colour per line: Lospec's .hex ("ff8800"), the app's own .txt export ("#ff8800") or Paint.NET's "FFff8800". */
function readHexLines(text: string): PaletteContents {
  let skipped = 0;
  let translucent = 0;
  const colors: string[] = [];
  for (const line of lines(text)) {
    if (!line || line.startsWith(";") || line.startsWith("//")) continue;
    const argb = /^#?([0-9a-f]{2})([0-9a-f]{6})$/i.exec(line);
    if (argb) {
      if (argb[1].toLowerCase() !== "ff") translucent++;
      colors.push(`#${argb[2].toLowerCase()}`);
      continue;
    }
    const color = parseHexColor(line);
    if (color) colors.push(color);
    else skipped++;
  }
  const warnings = skippedLines(skipped);
  if (translucent) warnings.push(`Palettes have no see-through colours; ${translucent} ${translucent === 1 ? "colour was" : "colours were"} made solid`);
  return { colors, warnings };
}

export const gplImporter = textPaletteImporter({
  id: "palette-gpl",
  label: "GIMP palette (.gpl)",
  description: "From GIMP, Aseprite, Krita or Inkscape",
  accept: [".gpl"],
  read: readGpl,
});

export const hexImporter = textPaletteImporter({
  id: "palette-hex",
  label: "Hex list (.hex, .txt)",
  description: "Lospec .hex, Paint.NET .txt, or one colour per line",
  accept: [".hex", ".txt", "text/plain"],
  read: readHexLines,
});

export const jascPalImporter = textPaletteImporter({
  id: "palette-pal",
  label: "JASC palette (.pal)",
  description: "From Paint Shop Pro and many pixel editors",
  accept: [".pal"],
  read: readJascPal,
});
