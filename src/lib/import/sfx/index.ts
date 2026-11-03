import type { SoundEffect } from "@/types";
import type { Importer } from "@/lib/import";
import { sfxrImporter } from "./sfxr";
import { soundJsonImporter } from "./sfx-json";

/** What the SFX generator's Import menu offers, in menu order. Add an importer here to offer a new format. */
export const SFX_IMPORTERS: Importer<SoundEffect>[] = [sfxrImporter, soundJsonImporter];
