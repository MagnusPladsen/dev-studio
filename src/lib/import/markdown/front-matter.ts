export type FrontMatterValue = string | string[] | boolean;

export interface MarkdownDocument {
  /** The `---` block at the top, read as simple YAML: `key: value`, `[a, b]` and `- item` lists, true/false. */
  data: Record<string, FrontMatterValue>;
  body: string;
}

function scalar(raw: string): string | boolean {
  const value = raw.trim();
  if (/^(true|yes)$/i.test(value)) return true;
  if (/^(false|no)$/i.test(value)) return false;
  return /^(["']).*\1$/.test(value) ? value.slice(1, -1) : value;
}

function inlineList(raw: string): string[] {
  return raw.trim().slice(1, -1).split(",").map((item) => String(scalar(item))).filter(Boolean);
}

/** Splits off and reads the front matter. Nested maps and multi-line strings are skipped. */
export function readMarkdown(text: string): MarkdownDocument {
  const normalized = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const match = /^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(normalized);
  if (!match) return { data: {}, body: normalized };
  const data: Record<string, FrontMatterValue> = {};
  let listKey: string | null = null;
  for (const line of match[1].split("\n")) {
    const item = /^\s*-\s+(.*)$/.exec(line);
    if (item && listKey) {
      (data[listKey] as string[]).push(String(scalar(item[1])));
      continue;
    }
    const pair = /^([\w-]+)\s*:\s*(.*)$/.exec(line);
    if (!pair) continue;
    const [, key, raw] = pair;
    listKey = raw.trim() === "" ? key.toLowerCase() : null;
    data[key.toLowerCase()] = listKey ? [] : /^\[.*\]$/.test(raw.trim()) ? inlineList(raw) : scalar(raw);
  }
  return { data, body: normalized.slice(match[0].length) };
}

export function text(value: FrontMatterValue | undefined): string {
  return typeof value === "string" ? value.trim() : Array.isArray(value) ? value.join(", ") : "";
}

/** `tags: [a, b]`, a `- a` list, or `tags: a, b` / `tags: "#a #b"`, without leading `#`. */
export function tagsOf(data: Record<string, FrontMatterValue>): string[] {
  const raw = data.tags ?? data.tag;
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(/[,\s]+/) : [];
  return [...new Set(list.map((tag) => tag.trim().replace(/^#/, "")).filter(Boolean))];
}

export function fileTitle(file: File): string {
  return file.name.replace(/\.(md|markdown)$/i, "").trim();
}

/**
 * The note's title: front-matter `title`, else the file name (what Obsidian's `[[links]]` point at). A first `# Heading`
 * that repeats the title is dropped from the body so it isn't shown twice.
 */
export function titleAndBody(file: File, document: MarkdownDocument): { title: string; body: string } {
  const title = text(document.data.title) || fileTitle(file) || "Untitled";
  const heading = /^\s*#\s+(.+?)\s*#*\s*(?:\n|$)/.exec(document.body);
  const body = heading && heading[1].trim().toLowerCase() === title.toLowerCase() ? document.body.slice(heading[0].length) : document.body;
  return { title, body: body.replace(/^\n+/, "").replace(/\s+$/, "") };
}

/** The folders between a picked folder and the file: "Vault/Design/Ideas/x.md" → "Design/Ideas". */
export function folderOf(file: File): string {
  const parts = (file.webkitRelativePath || "").split("/").slice(1, -1);
  return parts.join("/");
}

export const MARKDOWN_ACCEPT = [".md", ".markdown", "text/markdown"];
