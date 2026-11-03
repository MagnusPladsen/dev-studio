import { v4 as uuid } from "uuid";
import type { Decision, DecisionStatus } from "@/types";
import { ImportError, type Importer } from "@/lib/import";
import { MARKDOWN_ACCEPT, readMarkdown, tagsOf, text } from "@/lib/import/markdown/front-matter";

type Field = "context" | "options" | "decision" | "consequences";

/** Section headings of adr-tools (Nygard) and MADR records, and the field each one fills. */
const SECTION_FIELDS: [RegExp, Field | "status"][] = [
  [/^status$/, "status"],
  [/^(context|context and problem statement|problem|problem statement|background)$/, "context"],
  [/^decision drivers$/, "context"],
  [/^(considered options|options|options considered|alternatives|pros and cons of the options)$/, "options"],
  [/^(decision|decision outcome|confirmation)$/, "decision"],
  [/^(consequences|positive consequences|negative consequences)$/, "consequences"],
];

const STATUS_WORDS: [DecisionStatus, RegExp][] = [
  ["superseded", /^superseded/],
  ["accepted", /^(accepted|approved|done|adopted)/],
  ["deprecated", /^deprecated/],
  ["rejected", /^(rejected|declined)/],
  ["proposed", /^(proposed|draft|open|in review)/],
];

/** One ADR file as read, before the import links superseded records to each other. */
interface ParsedAdr {
  decision: Decision;
  /** The record's own number from its heading or file name (`0003-…`), or null. */
  number: number | null;
  supersededByNumber: number | null;
  isUnknownStatus: boolean;
}

/** "# 3. Use Postgres", "# ADR-0003: Use Postgres", "# 0003 - Use Postgres" → 3 and "Use Postgres". */
function numberedTitle(heading: string): { number: number | null; title: string } {
  const match = /^(?:adr[\s-]*)?(\d+)\s*[.:)\-–—]?\s+(.+)$/i.exec(heading.trim());
  return match ? { number: Number(match[1]), title: match[2].trim() } : { number: null, title: heading.trim() };
}

function statusFrom(value: string): { status: DecisionStatus; isKnown: boolean } {
  const word = value.trim().toLowerCase();
  const found = STATUS_WORDS.find(([, pattern]) => pattern.test(word))?.[0];
  return { status: found ?? "proposed", isKnown: Boolean(found) || !word };
}

/** "Superseded by [5. Use queues](0005-use-queues.md)", "superseded by ADR-0005" → 5. */
function supersededByNumber(text: string): number | null {
  const match = /superseded\s+by\s*:?\s*(.*)/i.exec(text);
  if (!match) return null;
  const number = /(?:adr[\s-]*)?(\d+)/i.exec(match[1].replace(/\]\(([^)]*)\)/, " $1 ")) ?? null;
  return number ? Number(number[1]) : null;
}

/** `Date: 2024-03-01` (adr-tools) or `* Date: …` (old MADR) in the text before the first section. */
function preambleValue(preamble: string, key: string): string {
  return new RegExp(`^\\s*[*-]?\\s*${key}\\s*:\\s*(.+)$`, "im").exec(preamble)?.[1].trim() ?? "";
}

function splitSections(body: string): { preamble: string; heading: string; sections: { heading: string; level: number; text: string }[] } {
  const lines = body.split("\n");
  const titleIndex = lines.findIndex((line) => /^#\s+/.test(line));
  const heading = titleIndex >= 0 ? lines[titleIndex].replace(/^#\s+/, "") : "";
  const sections: { heading: string; level: number; text: string }[] = [];
  const preamble: string[] = [];
  for (const line of lines.slice(titleIndex + 1)) {
    const match = /^(#{2,4})\s+(.+?)\s*#*$/.exec(line);
    if (match) sections.push({ heading: match[2], level: match[1].length, text: "" });
    else if (sections.length) sections[sections.length - 1].text += `${line}\n`;
    else preamble.push(line);
  }
  return { preamble: preamble.join("\n"), heading, sections };
}

const today = () => new Date().toISOString().slice(0, 10);

function dateFrom(value: string): string {
  return /^\d{4}-\d{2}-\d{2}/.exec(value)?.[0] ?? today();
}

/** Reads one ADR. Sections it doesn't know are kept, under their own heading, in the section before them. */
export function parseAdr(fileName: string, markdown: string): ParsedAdr {
  const document = readMarkdown(markdown);
  const { preamble, heading, sections } = splitSections(document.body);
  if (!heading && !sections.length) throw new ImportError(`"${fileName}" doesn't look like a decision record: it has no title or sections.`);
  const fromHeading = numberedTitle(heading || fileName.replace(/\.(md|markdown)$/i, "").replace(/-/g, " "));
  const fileNumber = /^(\d+)/.exec(fileName)?.[1];
  const fields: Record<Field, string[]> = { context: [], options: [], decision: [], consequences: [] };
  let statusText = text(document.data.status) || preambleValue(preamble, "status");
  let current: Field = "context";
  for (const section of sections) {
    const name = section.heading.trim().toLowerCase();
    const field = SECTION_FIELDS.find(([pattern]) => pattern.test(name))?.[1];
    const body = section.text.trim();
    if (field === "status") {
      statusText = body || statusText;
      continue;
    }
    // the first section of a field fills it; later ones (Decision drivers, More information) keep their heading
    if (field) current = field;
    const isFirst = Boolean(field) && fields[current].length === 0;
    if (body || !isFirst) fields[current].push(isFirst ? body : `### ${section.heading}\n\n${body}`.trim());
  }
  const statusLine = statusText.split("\n").find((line) => line.trim()) ?? "";
  const { status, isKnown } = statusFrom(statusLine);
  const now = new Date().toISOString();
  return {
    decision: {
      id: uuid(),
      projectId: "",
      number: 0,
      title: fromHeading.title || fileName,
      status,
      date: dateFrom(text(document.data.date) || preambleValue(preamble, "date")),
      context: fields.context.join("\n\n"),
      options: fields.options.join("\n\n"),
      decision: fields.decision.join("\n\n"),
      consequences: fields.consequences.join("\n\n"),
      tags: tagsOf(document.data),
      createdAt: now,
      updatedAt: now,
    },
    number: fromHeading.number ?? (fileNumber ? Number(fileNumber) : null),
    supersededByNumber: supersededByNumber(statusText),
    isUnknownStatus: !isKnown,
  };
}

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

/** Links "superseded by" between the imported records, in number order; the Decision log renumbers them after its own. */
export function linkRecords(parsed: ParsedAdr[]): { items: Decision[]; warnings: string[] } {
  const ordered = [...parsed].sort((a, b) => (a.number ?? Infinity) - (b.number ?? Infinity));
  const byNumber = new Map(ordered.flatMap((record) => (record.number === null ? [] : [[record.number, record.decision.id] as const])));
  let unlinked = 0;
  const items = ordered.map(({ decision, supersededByNumber: target }, index) => {
    const supersededBy = target === null ? undefined : byNumber.get(target);
    if (target !== null && !supersededBy) unlinked++;
    return { ...decision, number: index + 1, ...(supersededBy ? { supersededBy, status: "superseded" as const } : {}) };
  });
  const unknown = parsed.filter((record) => record.isUnknownStatus).length;
  const warnings = [];
  if (unlinked) warnings.push(`${plural(unlinked, "record is", "records are")} superseded by a record that wasn't imported, so the link was left out`);
  if (unknown) warnings.push(`${plural(unknown, "record has a status", "records have statuses")} the log doesn't know, so ${unknown === 1 ? "it is" : "they are"} marked proposed`);
  return { items, warnings };
}

async function parseRecords(files: File[]) {
  const parsed: ParsedAdr[] = [];
  const failed: string[] = [];
  for (const file of files) {
    try {
      parsed.push(parseAdr(file.name, await file.text()));
    } catch (error) {
      if (!(error instanceof ImportError) || files.length === 1) throw error;
      failed.push(error.message);
    }
  }
  const { items, warnings } = linkRecords(parsed);
  return { items, warnings: [...failed, ...warnings] };
}

/** Architecture decision records in the adr-tools or MADR layout, one per file or a folder (`doc/adr`). */
export const adrMarkdownImporter: Importer<Decision> = {
  id: "decisions-adr-markdown",
  label: "ADR Markdown files (.md)",
  description: "adr-tools or MADR records, with their supersede links",
  accept: MARKDOWN_ACCEPT,
  pick: "many",
  parse: (file) => parseRecords([file]),
  parseFiles: parseRecords,
};

export const adrFolderImporter: Importer<Decision> = {
  ...adrMarkdownImporter,
  id: "decisions-adr-folder",
  label: "Folder of ADRs",
  description: "A doc/adr folder; other files are skipped",
  pick: "folder",
};
