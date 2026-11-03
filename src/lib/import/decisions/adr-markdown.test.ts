import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runImporter, runImporterOnFiles } from "@/lib/import";
import { textFile } from "@/lib/import/test-helpers";
import { adrMarkdownImporter } from "./adr-markdown";

const NAMES = ["0003-store-saves-in-indexeddb.md", "0001-record-architecture-decisions.md", "0004-old-madr.md", "0002-store-saves-in-local-storage.md"];
const fixture = (name: string) => textFile(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"), name, "text/markdown");

async function importAll() {
  const outcome = await runImporterOnFiles(adrMarkdownImporter, NAMES.map(fixture));
  if (!outcome.ok) throw new Error(outcome.message);
  return outcome.result;
}

describe("ADR Markdown import", () => {
  it("reads adr-tools records: numbered title, date, status and sections, in number order", async () => {
    const { items } = await importAll();
    expect(items.map((decision) => decision.title)).toEqual(["Record architecture decisions", "Store saves in local storage", "Store saves in IndexedDB", "Drop the level editor from the first release"]);
    expect(items[0]).toMatchObject({ status: "accepted", date: "2026-01-12", decision: "We will use Architecture Decision Records, as described by Michael Nygard.", consequences: "See Michael Nygard's article, linked above." });
  });

  it("links 'Superseded by' to the record in the same import", async () => {
    const { items, warnings } = await importAll();
    expect(items[1]).toMatchObject({ status: "superseded", supersededBy: items[2].id });
    expect(items[3]).toMatchObject({ status: "superseded" });
    expect(items[3].supersededBy).toBeUndefined();
    expect(warnings).toEqual(["1 record is superseded by a record that wasn't imported, so the link was left out"]);
  });

  it("reads MADR: front matter, nested Consequences, extra sections kept under their heading", async () => {
    const { items } = await importAll();
    const madr = items[2];
    expect(madr).toMatchObject({ status: "accepted", date: "2026-02-03", tags: ["storage", "saves"] });
    expect(madr.context).toBe("Saves with screenshots outgrew localStorage.\n\n### Decision Drivers\n\n* Room for screenshots\n* Works offline");
    expect(madr.options).toBe("* IndexedDB\n* A server");
    expect(madr.decision).toBe('Chosen option: "IndexedDB", because it keeps working offline.');
    expect(madr.consequences).toBe("* Good, because saves can hold screenshots.\n* Bad, because the API is clumsy.\n\n### More Information\n\nSupersedes ADR-0002.");
    expect(items[3]).toMatchObject({ date: "2026-02-10", decision: "Ship without it." });
  });

  it("skips non-Markdown files in a folder and rejects text that isn't a record", async () => {
    const outcome = await runImporterOnFiles(adrMarkdownImporter, [fixture(NAMES[1]), textFile("x", "diagram.png", "image/png")]);
    expect(outcome.ok && outcome.result.warnings[0]).toBe('Skipped 1 file this tool can\'t read: "diagram.png"');
    expect(await runImporter(adrMarkdownImporter, textFile("just some text", "notes.md"))).toEqual({ ok: false, message: expect.stringContaining("doesn't look like a decision record") });
  });
});
