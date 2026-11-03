import type { Note } from "@/types";
import type { Importer } from "@/lib/import";
import { notebookFolderImporter, notebookMarkdownImporter } from "./markdown";

/** What the Notebook's Import menu offers, in menu order. Add an importer here to offer a new format. */
export const NOTEBOOK_IMPORTERS: Importer<Note>[] = [notebookMarkdownImporter, notebookFolderImporter];
