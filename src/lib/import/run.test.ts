import { describe, expect, it } from "vitest";
import { acceptsDragType, acceptsFile, findImporter, runImporter } from "./run";
import { textFile } from "./test-helpers";
import { ImportError, type Importer } from "./types";

const importer = (id: string, accept: string[], detect?: Importer<string>["detect"]): Importer<string> => ({
  id,
  label: id,
  accept,
  detect,
  parse: async (file) => ({ items: [await file.text()], warnings: [] }),
});

describe("import runner", () => {
  it("matches files by extension, MIME type and wildcard", () => {
    expect(acceptsFile([".json"], { name: "Board.JSON", type: "" })).toBe(true);
    expect(acceptsFile(["application/json"], { name: "x", type: "application/json" })).toBe(true);
    expect(acceptsFile(["image/*"], { name: "x.png", type: "image/png" })).toBe(true);
    expect(acceptsFile([".json"], { name: "x.png", type: "image/png" })).toBe(false);
    expect(acceptsDragType([importer("json", [".json", "application/json"])], "image/png")).toBe(false);
  });

  it("uses detect to pick between importers of the same extension", async () => {
    const importers = [importer("a", [".json"], (_f, text) => text.includes("alpha")), importer("b", [".json"], (_f, text) => text.includes("beta"))];
    expect((await findImporter(importers, textFile('{"beta":1}')))?.id).toBe("b");
    expect(await findImporter(importers, textFile("{}"))).toBeNull();
  });

  it("turns failures into plain messages", async () => {
    const throwing: Importer<string> = { ...importer("x", [".json"]), parse: async () => { throw new ImportError("Not a canvas file."); } };
    expect(await runImporter(throwing, textFile("{}"))).toEqual({ ok: false, message: "Not a canvas file." });
    const crashing: Importer<string> = { ...importer("x", [".json"]), parse: async () => { throw new TypeError("x is undefined"); } };
    const outcome = await runImporter(crashing, textFile("{}", "map.json"));
    expect(outcome.ok === false && outcome.message).toContain('"map.json"');
    expect(outcome.ok === false && outcome.message).not.toContain("undefined");
  });

  it("reports an empty file as nothing to import", async () => {
    const empty: Importer<string> = { ...importer("x", [".json"]), parse: async () => ({ items: [], warnings: [] }) };
    expect((await runImporter(empty, textFile("[]"))).ok).toBe(false);
  });
});
