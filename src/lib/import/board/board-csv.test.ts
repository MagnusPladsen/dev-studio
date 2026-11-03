import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runImporter } from "@/lib/import";
import { textFile } from "@/lib/import/test-helpers";
import { boardCsvImporter } from "./board-csv";
import { parseCsvRows } from "./csv-table";
import { detectPreset, mappingFor, presetById } from "./csv-presets";
import { draftsFromCsv } from "./csv-issues";
import { dateFrom } from "./fields";

const fixture = (name: string) => textFile(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"), name, "text/csv");

async function drafts(name: string) {
  const outcome = await runImporter(boardCsvImporter, fixture(name));
  if (!outcome.ok) throw new Error(outcome.message);
  return outcome.result;
}

describe("CSV table", () => {
  it("reads quotes, doubled quotes, line breaks in cells, CRLF and semicolons", () => {
    expect(parseCsvRows('a,b\r\n"x, ""y""","two\nlines"\r\n')).toEqual([["a", "b"], ['x, "y"', "two\nlines"]]);
    expect(parseCsvRows("a;b\n1;2")).toEqual([["a", "b"], ["1", "2"]]);
    expect(parseCsvRows("﻿Title\n'=SUM(1)")).toEqual([["Title"], ["=SUM(1)"]]);
  });
});

describe("Issues CSV import", () => {
  it("reads a Jira export: repeated Labels and Sprint columns, status category, Jira dates", async () => {
    const { items, warnings } = await drafts("jira.csv");
    expect(items.map((item) => item.title)).toEqual(["Save slots overwrite each other", "Add a pause menu", "Write release notes"]);
    const [bug, story, task] = items;
    expect(bug).toMatchObject({ type: "bug", priority: "high", status: { name: "In Review", category: "doing" }, sprint: { name: "Sprint 5" }, points: 3, dueDate: "2026-03-14", labels: ["save-system"] });
    expect(bug.description).toContain("Repro: save in slot 1");
    expect(story).toMatchObject({ type: "feature", labels: ["ui", "menus"], sprint: null, status: { category: "todo" } });
    expect(task).toMatchObject({ status: { category: "done" }, dueDate: undefined });
    expect(warnings).toEqual(["Left out 1 row without a title", "1 due date wasn't readable, so it was left empty"]);
  });

  it("reads a Linear export: types from labels, Urgent, cycles, archived", async () => {
    const { items } = await drafts("linear.csv");
    expect(items[0]).toMatchObject({ type: "bug", priority: "highest", sprint: { name: "Cycle 7" }, labels: ["Bug", "Mobile"], points: 2, dueDate: "2026-04-02" });
    expect(items[1]).toMatchObject({ type: "feature", priority: "medium", status: { category: "todo" } });
    expect(items[2]).toMatchObject({ archived: true, status: { name: "Canceled", category: "done" } });
  });

  it("reads GitHub Projects and Trello exports", async () => {
    const github = await drafts("github.csv");
    expect(github.items[0]).toMatchObject({ type: "bug", priority: "high", sprint: { name: "Iteration 2" }, labels: ["bug", "tilemap"], status: { category: "doing" } });
    const trello = await drafts("trello.csv");
    expect(trello.items.map((item) => item.labels)).toEqual([["Audio", "Polish"], [], ["Art"]]);
    expect(trello.items[0]).toMatchObject({ type: "audio", status: { name: "Doing", category: "doing" }, dueDate: "2026-05-01" });
    expect(trello.items[1].archived).toBeUndefined();
    expect(trello.items[2].archived).toBe(true);
  });

  it("detects the tool from the headers and maps again with another mapping", async () => {
    const { items } = await drafts("github.csv");
    const source = items[0].csv!;
    expect(detectPreset(source.headers).id).toBe("github");
    const mapping = mappingFor(presetById("other"), source.headers);
    expect(draftsFromCsv(source, { ...mapping, fields: { ...mapping.fields, title: "Repository" } }).items[0].title).toBe("example/game");
  });

  it("reads this board's own CSV export", async () => {
    const own = textFile('"Key","Title","Type","Priority","Status","Sprint","Points","Due","Labels","Archived","Description"\n"PIP-1","Jump","Feature","Highest","Done","Backlog","2","2026-01-05","movement feel","no","Coyote time"', "pip-issues.csv");
    const outcome = await runImporter(boardCsvImporter, own);
    expect(outcome.ok && outcome.result.items[0]).toMatchObject({ title: "Jump", type: "feature", priority: "highest", sprint: null, labels: ["movement", "feel"], description: "Coyote time" });
  });

  it("rejects a file with only a header", async () => {
    expect(await runImporter(boardCsvImporter, textFile("Title,Status\n", "empty.csv"))).toEqual({ ok: false, message: expect.stringContaining("no rows") });
  });

  it("reads the date formats trackers write", () => {
    expect(dateFrom("2026-04-02T10:00:00Z")).toBe("2026-04-02");
    expect(dateFrom("3/Feb/26 9:00 AM")).toBe("2026-02-03");
    expect(dateFrom("12/31/2026")).toBe("2026-12-31");
    expect(dateFrom("soon")).toBeUndefined();
  });
});
