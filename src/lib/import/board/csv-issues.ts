import type { ImportResult } from "@/lib/import";
import type { CsvMapping, CsvField, LabelStyle } from "./csv-presets";
import { categoryFrom, dateFrom, isYes, issueTypeFrom, pointsFrom, priorityFrom } from "./fields";
import type { CsvSource, IssueDraft } from "./types";

function splitLabels(cell: string, style: LabelStyle): string[] {
  const parts = style === "space" ? cell.split(/\s+/) : cell.split(/[,;]/);
  return parts.map((part) => (style === "trello" ? part.replace(/\s*\([^)]*\)\s*$/, "") : part).trim()).filter(Boolean);
}

/** Every cell under the mapped header; Jira repeats "Labels" and "Sprint" once per value. */
function cellsOf(source: CsvSource, row: string[], header: string): string[] {
  if (!header) return [];
  return source.headers.flatMap((name, index) => (name === header && row[index].trim() ? [row[index].trim()] : []));
}

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

/** Turns CSV rows into issue drafts with the given column mapping. Rows without a title are left out. */
export function draftsFromCsv(source: CsvSource, mapping: CsvMapping): ImportResult<IssueDraft> {
  let untitled = 0;
  let badDates = 0;
  const items: IssueDraft[] = [];
  for (const row of source.rows) {
    const all = (field: CsvField) => cellsOf(source, row, mapping.fields[field]);
    const first = (field: CsvField) => all(field)[0] ?? "";
    const title = first("title");
    if (!title) {
      untitled++;
      continue;
    }
    const labels = [...new Set(all("labels").flatMap((cell) => splitLabels(cell, mapping.labels)))];
    const status = first("status") || "To Do";
    const dueText = first("dueDate");
    const dueDate = dateFrom(dueText);
    if (dueText && !dueDate) badDates++;
    const sprintName = all("sprint").at(-1);
    items.push({
      title,
      description: first("description"),
      type: issueTypeFrom(first("type")) ?? labels.map(issueTypeFrom).find(Boolean) ?? null,
      priority: priorityFrom(first("priority")),
      status: { name: status, category: categoryFrom(first("statusCategory") || status) },
      sprint: sprintName && !/^backlog$/i.test(sprintName) ? { name: sprintName, state: "planned" } : null,
      points: pointsFrom(first("points")),
      dueDate,
      labels,
      archived: isYes(first("archived")) || undefined,
      csv: source,
    });
  }
  const warnings = [];
  if (untitled) warnings.push(`Left out ${plural(untitled, "row", "rows")} without a title`);
  if (badDates) warnings.push(`${plural(badDates, "due date wasn't", "due dates weren't")} readable, so ${badDates === 1 ? "it was" : "they were"} left empty`);
  return { items, warnings };
}
