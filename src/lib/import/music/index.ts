import type { MusicTrack } from "@/types";
import type { Importer } from "@/lib/import";
import { midiImporter } from "./midi";
import { songJsonImporter } from "./song-json";

/** What the Music composer's Import menu offers, in menu order. Add an importer here to offer a new format. */
export const MUSIC_IMPORTERS: Importer<MusicTrack>[] = [midiImporter, songJsonImporter];
