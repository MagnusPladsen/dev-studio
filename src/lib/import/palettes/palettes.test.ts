import { describe, expect, it } from "vitest";
import { runImporter, type Importer } from "@/lib/import";
import { textFile } from "@/lib/import/test-helpers";
import type { Palette } from "@/types";
import { binaryFile } from "../image/test-images";
import { aseImporter } from "./ase";
import { lospecJsonImporter, lospecJsonUrl, lospecSlug } from "./lospec";
import { gplImporter, hexImporter, jascPalImporter } from "./text-formats";

async function importPalette(importer: Importer<Palette>, file: File) {
  const outcome = await runImporter(importer, file);
  if (!outcome.ok) throw new Error(outcome.message);
  return { palette: outcome.result.items[0], warnings: outcome.result.warnings };
}

/** The GIMP palette the Palettes tool exports (see `exportGpl`). */
const exportedGpl = ["GIMP Palette", "Name: Forest", "Columns: 8", "#", "  0   0   0\t#000000", " 51 102 255\t#3366FF", ""].join("\n");

describe("GIMP palette import", () => {
  it("should read the app's own .gpl export with its name", async () => {
    const { palette, warnings } = await importPalette(gplImporter, textFile(exportedGpl, "forest.gpl", ""));
    expect([palette.name, palette.colors, warnings]).toEqual(["Forest", ["#000000", "#3366ff"], []]);
  });

  it("should refuse a file without the GIMP header", async () => {
    await expect(runImporter(gplImporter, textFile("0 0 0", "x.gpl", ""))).resolves.toMatchObject({ ok: false, message: expect.stringContaining("GIMP Palette") });
  });
});

describe("Hex list import", () => {
  it("should read Lospec .hex files and name the palette after the file", async () => {
    const { palette } = await importPalette(hexImporter, textFile("1a1c2c\r\n5d275d\r\n", "sweetie-16.hex", ""));
    expect([palette.name, palette.colors]).toEqual(["sweetie 16", ["#1a1c2c", "#5d275d"]]);
  });

  it("should read the app's own .txt export", async () => {
    const { palette } = await importPalette(hexImporter, textFile("#000000\n#FFF1E8\n", "pico.txt", "text/plain"));
    expect(palette.colors).toEqual(["#000000", "#fff1e8"]);
  });

  it("should read Paint.NET palettes, skipping comments and making see-through colours solid", async () => {
    const text = "; paint.net Palette File\n; Colors: 2\nFF336699\n80FFFFFF\n";
    const { palette, warnings } = await importPalette(hexImporter, textFile(text, "pdn.txt", "text/plain"));
    expect(palette.colors).toEqual(["#336699", "#ffffff"]);
    expect(warnings).toEqual(["Palettes have no see-through colours; 1 colour was made solid"]);
  });

  it("should warn about lines that aren't colours and refuse files with none", async () => {
    const { warnings } = await importPalette(hexImporter, textFile("ff0000\nhello\n", "a.hex", ""));
    expect(warnings).toEqual(["Skipped 1 line that wasn't a colour"]);
    await expect(runImporter(hexImporter, textFile("nothing here", "b.hex", ""))).resolves.toMatchObject({ ok: false, message: "This palette file has no colours in it." });
  });

  it("should keep at most 256 colours", async () => {
    const text = Array.from({ length: 300 }, (_, i) => i.toString(16).padStart(6, "0")).join("\n");
    const { palette, warnings } = await importPalette(hexImporter, textFile(text, "big.hex", ""));
    expect(palette.colors).toHaveLength(256);
    expect(warnings).toEqual(["Kept the first 256 of 300 colours"]);
  });
});

describe("JASC palette import", () => {
  it("should read colours after the header and count", async () => {
    const { palette, warnings } = await importPalette(jascPalImporter, textFile("JASC-PAL\r\n0100\r\n2\r\n255 0 0\r\n0 128 255\r\n", "two.pal", ""));
    expect([palette.colors, warnings]).toEqual([["#ff0000", "#0080ff"], []]);
  });

  it("should refuse other .pal files", async () => {
    await expect(runImporter(jascPalImporter, textFile("RIFF....PAL data", "ms.pal", ""))).resolves.toMatchObject({ ok: false, message: expect.stringContaining("JASC-PAL") });
  });
});

/** Builds an .ase file in code: an optional group, then swatches as [name, model, values]. */
function aseFile(group: string | null, swatches: [string, string, number[]][]): File {
  const bytes: number[] = [];
  const u16 = (n: number) => bytes.push((n >> 8) & 255, n & 255);
  const u32 = (n: number) => bytes.push((n >>> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255);
  const nameBytes = (name: string) => {
    const out = [((name.length + 1) >> 8) & 255, (name.length + 1) & 255];
    for (const char of name + "\0") out.push(0, char.charCodeAt(0));
    return out;
  };
  const float = (n: number) => [...new Uint8Array(new Float32Array([n]).buffer)].reverse();
  const blocks: [number, number[]][] = [];
  if (group) blocks.push([0xc001, nameBytes(group)]);
  for (const [name, model, values] of swatches) blocks.push([1, [...nameBytes(name), ...[...model].map((c) => c.charCodeAt(0)), ...values.flatMap(float), 0, 2]]);
  bytes.push(...[..."ASEF"].map((c) => c.charCodeAt(0)));
  u16(1);
  u16(0);
  u32(blocks.length);
  for (const [type, body] of blocks) {
    u16(type);
    u32(body.length);
    bytes.push(...body);
  }
  return binaryFile(bytes, "swatches.ase");
}

describe("Adobe swatch import", () => {
  it("should read RGB and grey swatches and the group's name", async () => {
    const file = aseFile("Sunset", [["Orange", "RGB ", [1, 0.5, 0]], ["Mid grey", "Gray", [0.5]]]);
    const { palette, warnings } = await importPalette(aseImporter, file);
    expect([palette.name, palette.colors, warnings]).toEqual(["Sunset", ["#ff8000", "#808080"], []]);
  });

  it("should skip CMYK swatches with a warning", async () => {
    const { palette, warnings } = await importPalette(aseImporter, aseFile(null, [["Red", "RGB ", [1, 0, 0]], ["Ink", "CMYK", [0, 1, 1, 0]]]));
    expect([palette.name, palette.colors]).toEqual(["swatches", ["#ff0000"]]);
    expect(warnings).toEqual(["Skipped 1 CMYK or Lab swatch; only RGB and grey are read"]);
  });

  it("should say so when every swatch is CMYK", async () => {
    await expect(runImporter(aseImporter, aseFile(null, [["Ink", "CMYK", [0, 1, 1, 0]]]))).resolves.toMatchObject({ ok: false, message: expect.stringContaining("only has CMYK") });
  });

  it("should refuse files that aren't swatches", async () => {
    await expect(runImporter(aseImporter, binaryFile([1, 2, 3], "x.ase"))).resolves.toMatchObject({ ok: false, message: expect.stringContaining("isn't an Adobe swatch") });
  });
});

describe("Lospec", () => {
  it("should read Lospec's palette JSON, crediting the author", async () => {
    const json = JSON.stringify({ name: "Endesga 32", author: "ENDESGA", colors: ["be4a2f", "d77643"] });
    const { palette } = await importPalette(lospecJsonImporter, textFile(json, "endesga-32.json"));
    expect([palette.name, palette.colors]).toEqual(["Endesga 32 by ENDESGA", ["#be4a2f", "#d77643"]]);
  });

  it.each([
    ["Endesga 32", "endesga-32"],
    ["sweetie-16", "sweetie-16"],
    ["https://lospec.com/palette-list/resurrect-64", "resurrect-64"],
    ["lospec.com/palette-list/pico-8.hex", "pico-8"],
    ["https://evil.example/palette-list/pico-8", null],
    ["https://lospec.com/../../etc", null],
    ["!!!", null],
  ])("should turn %s into the slug %s", (input, slug) => {
    expect(lospecSlug(input)).toBe(slug);
  });

  it("should only ever fetch from lospec.com", () => {
    expect(lospecJsonUrl("endesga-32")).toBe("https://lospec.com/palette-list/endesga-32.json");
  });
});
