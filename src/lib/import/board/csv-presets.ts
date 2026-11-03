/** The issue fields a CSV column can fill. */
export const CSV_FIELDS = ["title", "description", "status", "statusCategory", "type", "priority", "labels", "points", "dueDate", "sprint", "archived"] as const;
export type CsvField = (typeof CSV_FIELDS)[number];

export const CSV_FIELD_LABELS: Record<CsvField, string> = {
  title: "Title",
  description: "Description",
  status: "Status → column",
  statusCategory: "Status category",
  type: "Type",
  priority: "Priority",
  labels: "Labels",
  points: "Points",
  dueDate: "Due date",
  sprint: "Sprint",
  archived: "Archived",
};

/** How one cell holds several labels: "a, b", "a b" (this app's export) or "Bug (red), UI (green)" (Trello). */
export type LabelStyle = "comma" | "space" | "trello";

export type CsvPresetId = "jira" | "linear" | "github" | "trello" | "studio" | "other";

export interface CsvPreset {
  id: CsvPresetId;
  label: string;
  /** Headers that, all present, say the file came from this tool. */
  signature: string[];
  /** For each field, the header names this tool uses, best first. */
  columns: Partial<Record<CsvField, string[]>>;
  labels: LabelStyle;
}

/** Which column fills each field ("" = none), and how labels are split. */
export interface CsvMapping {
  fields: Record<CsvField, string>;
  labels: LabelStyle;
}

export const CSV_PRESETS: CsvPreset[] = [
  {
    id: "jira",
    label: "Jira",
    signature: ["Issue key", "Summary"],
    labels: "comma",
    columns: {
      title: ["Summary"],
      description: ["Description"],
      status: ["Status"],
      statusCategory: ["Status Category"],
      type: ["Issue Type"],
      priority: ["Priority"],
      labels: ["Labels"],
      points: ["Custom field (Story Points)", "Custom field (Story point estimate)", "Story Points", "Story point estimate"],
      dueDate: ["Due date", "Due Date"],
      sprint: ["Sprint"],
    },
  },
  {
    id: "linear",
    label: "Linear",
    signature: ["ID", "Title", "Team", "Status"],
    labels: "comma",
    columns: {
      title: ["Title"],
      description: ["Description"],
      status: ["Status"],
      priority: ["Priority"],
      labels: ["Labels"],
      points: ["Estimate"],
      dueDate: ["Due Date"],
      sprint: ["Cycle Name"],
      archived: ["Archived"],
    },
  },
  {
    id: "github",
    label: "GitHub Projects",
    signature: ["Title", "URL", "Repository"],
    labels: "comma",
    columns: {
      title: ["Title"],
      description: ["Body", "Description"],
      status: ["Status"],
      type: ["Type", "Issue Type"],
      priority: ["Priority"],
      labels: ["Labels"],
      points: ["Estimate", "Size", "Story Points"],
      dueDate: ["Due date", "Due Date", "Target date", "End date"],
      sprint: ["Iteration", "Sprint", "Milestone"],
    },
  },
  {
    id: "trello",
    label: "Trello",
    signature: ["Card Name", "List Name"],
    labels: "trello",
    columns: {
      title: ["Card Name"],
      description: ["Card Description"],
      status: ["List Name"],
      labels: ["Labels"],
      dueDate: ["Due Date"],
      archived: ["Archived"],
    },
  },
  {
    id: "studio",
    label: "This board's CSV export",
    signature: ["Key", "Title", "Status", "Sprint", "Archived"],
    labels: "space",
    columns: {
      title: ["Title"],
      description: ["Description"],
      status: ["Status"],
      type: ["Type"],
      priority: ["Priority"],
      labels: ["Labels"],
      points: ["Points"],
      dueDate: ["Due"],
      sprint: ["Sprint"],
      archived: ["Archived"],
    },
  },
  {
    id: "other",
    label: "Other (match by name)",
    signature: [],
    labels: "comma",
    columns: {
      title: ["Title", "Summary", "Name", "Card Name", "Task", "Subject"],
      description: ["Description", "Body", "Details", "Notes", "Card Description"],
      status: ["Status", "State", "Column", "List", "List Name", "Stage"],
      statusCategory: ["Status Category"],
      type: ["Type", "Issue Type", "Kind"],
      priority: ["Priority"],
      labels: ["Labels", "Tags", "Label"],
      points: ["Points", "Story Points", "Estimate", "Size"],
      dueDate: ["Due Date", "Due", "Deadline", "Target date"],
      sprint: ["Sprint", "Iteration", "Cycle", "Cycle Name", "Milestone"],
      archived: ["Archived"],
    },
  },
];

const lower = (text: string) => text.trim().toLowerCase();

export function presetById(id: CsvPresetId): CsvPreset {
  return CSV_PRESETS.find((preset) => preset.id === id) ?? CSV_PRESETS[CSV_PRESETS.length - 1];
}

/** The tool the file came from, judged by its headers; "other" when none fits. */
export function detectPreset(headers: string[]): CsvPreset {
  const present = new Set(headers.map(lower));
  return CSV_PRESETS.find((preset) => preset.signature.length && preset.signature.every((header) => present.has(lower(header)))) ?? presetById("other");
}

/** Matches the preset's column names to the file's headers. Without a title column, the first column is the title. */
export function mappingFor(preset: CsvPreset, headers: string[]): CsvMapping {
  const find = (names: string[] = []) => names.map((name) => headers.find((header) => lower(header) === lower(name))).find(Boolean) ?? "";
  const fields = Object.fromEntries(CSV_FIELDS.map((field) => [field, find(preset.columns[field])])) as Record<CsvField, string>;
  if (!fields.title && headers.length) fields.title = headers[0];
  return { fields, labels: preset.labels };
}
