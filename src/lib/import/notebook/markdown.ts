import { v4 as uuid } from "uuid";
import type { Note } from "@/types";
import type { Importer } from "@/lib/import";
import { MARKDOWN_ACCEPT, folderOf, readMarkdown, tagsOf, text, titleAndBody } from "@/lib/import/markdown/front-matter";
import { embedsWarning, fromObsidian } from "@/lib/import/markdown/obsidian";

/** `* [x] Done` and `+ [ ] Todo` become the Notebook's `- [x]` / `- [ ]` checklist lines. */
export function normalizeChecklists(body: string): string {
  return body.replace(/^(\s*)[*+-] \[([ xX])\]/gm, (_match, indent: string, mark: string) => `${indent}- [${mark === " " ? " " : "x"}]`);
}

async function readNote(file: File): Promise<{ note: Note; droppedEmbeds: number }> {
  const document = readMarkdown(await file.text());
  const { title, body } = titleAndBody(file, document);
  const { body: content, droppedEmbeds } = fromObsidian(normalizeChecklists(body));
  const now = new Date().toISOString();
  const note: Note = {
    id: uuid(),
    projectId: "",
    title,
    content,
    folder: text(document.data.folder) || folderOf(file),
    pinned: document.data.pinned === true,
    tags: tagsOf(document.data),
    createdAt: now,
    updatedAt: now,
  };
  return { note, droppedEmbeds };
}

async function parseNotes(files: File[]) {
  const read = await Promise.all(files.map(readNote));
  return { items: read.map((result) => result.note), warnings: embedsWarning(read.reduce((sum, result) => sum + result.droppedEmbeds, 0)) };
}

export const notebookMarkdownImporter: Importer<Note> = {
  id: "notebook-markdown",
  label: "Markdown files (.md)",
  description: "One note per file, with checklists, tags and pinned",
  accept: MARKDOWN_ACCEPT,
  pick: "many",
  parse: (file) => parseNotes([file]),
  parseFiles: parseNotes,
};

export const notebookFolderImporter: Importer<Note> = {
  ...notebookMarkdownImporter,
  id: "notebook-markdown-folder",
  label: "Folder of Markdown files",
  description: "Sub-folders become note folders; other files are skipped",
  pick: "folder",
};
