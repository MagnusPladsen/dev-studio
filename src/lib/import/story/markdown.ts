import { v4 as uuid } from "uuid";
import type { StoryEntry } from "@/types";
import type { Importer } from "@/lib/import";
import { DEV_STUDIO_COPY } from "@/copy/dev-studio";
import { GAMEDEV_STUDIO_COPY } from "@/copy/gamedev-studio";
import { MARKDOWN_ACCEPT, readMarkdown, tagsOf, text, titleAndBody } from "@/lib/import/markdown/front-matter";
import { embedsWarning, fromObsidian } from "@/lib/import/markdown/obsidian";

type EntryType = StoryEntry["type"];
const ENTRY_TYPES = Object.keys(GAMEDEV_STUDIO_COPY.story.entryTypes) as EntryType[];

/** A front-matter `type` as an entry type: its value ("character") or its name in either app ("Person", "Lore"). */
export function entryTypeFrom(value: string): EntryType | null {
  const word = value.trim().toLowerCase();
  if (!word) return null;
  return ENTRY_TYPES.find((type) => [type, GAMEDEV_STUDIO_COPY.story.entryTypes[type], DEV_STUDIO_COPY.story.entryTypes[type]].some((name) => name.toLowerCase() === word)) ?? null;
}

async function readEntry(file: File): Promise<{ entry: StoryEntry; droppedEmbeds: number; unknownType: boolean }> {
  const document = readMarkdown(await file.text());
  const { title, body } = titleAndBody(file, document);
  const { body: content, droppedEmbeds } = fromObsidian(body);
  const type = entryTypeFrom(text(document.data.type));
  const now = new Date().toISOString();
  const entry: StoryEntry = { id: uuid(), projectId: "", title, content, type: type ?? "note", links: [], tags: tagsOf(document.data), createdAt: now, updatedAt: now };
  return { entry, droppedEmbeds, unknownType: Boolean(text(document.data.type)) && !type };
}

/** Markdown notes (one, several or a whole Obsidian vault) as wiki entries. `[[links]]` keep working by title. */
async function parseEntries(files: File[]) {
  const read = await Promise.all(files.map(readEntry));
  const unknownTypes = read.filter((result) => result.unknownType).length;
  const warnings = embedsWarning(read.reduce((sum, result) => sum + result.droppedEmbeds, 0));
  if (unknownTypes) warnings.push(`${unknownTypes} ${unknownTypes === 1 ? "file has a type" : "files have types"} the wiki doesn't know, so ${unknownTypes === 1 ? "it was" : "they were"} filed under Other`);
  return { items: read.map((result) => result.entry), warnings };
}

export const storyMarkdownImporter: Importer<StoryEntry> = {
  id: "story-markdown",
  label: "Markdown files (.md)",
  description: "One entry per file; front-matter title, tags and type are used",
  accept: MARKDOWN_ACCEPT,
  pick: "many",
  parse: (file) => parseEntries([file]),
  parseFiles: parseEntries,
};

export const storyFolderImporter: Importer<StoryEntry> = {
  ...storyMarkdownImporter,
  id: "story-markdown-folder",
  label: "Folder of Markdown files",
  description: "A whole folder, like an Obsidian vault; other files are skipped",
  pick: "folder",
};
