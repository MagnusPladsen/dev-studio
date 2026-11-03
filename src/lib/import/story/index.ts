import type { StoryEntry } from "@/types";
import type { Importer } from "@/lib/import";
import { storyFolderImporter, storyMarkdownImporter } from "./markdown";

/** What the Wiki / Story Import menu offers, in menu order. Add an importer here to offer a new format. */
export const STORY_IMPORTERS: Importer<StoryEntry>[] = [storyMarkdownImporter, storyFolderImporter];
