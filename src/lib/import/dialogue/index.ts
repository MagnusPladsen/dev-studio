import type { DialogueTree } from "@/types";
import type { Importer } from "@/lib/import";
import { dialogueJsonImporter } from "./dialogue-json";

/** What the Dialogue tool's Import menu offers, in menu order. Add an importer here to offer a new format. */
export const DIALOGUE_IMPORTERS: Importer<DialogueTree>[] = [dialogueJsonImporter];
