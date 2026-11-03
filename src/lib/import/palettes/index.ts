import type { Palette } from "@/types";
import type { Importer } from "@/lib/import";
import { aseImporter } from "./ase";
import { lospecJsonImporter } from "./lospec";
import { gplImporter, hexImporter, jascPalImporter } from "./text-formats";

export { lospecJsonImporter, lospecJsonUrl, lospecSlug } from "./lospec";

/** What Palettes' Import menu offers, in menu order. Add an importer here to offer a new format. */
export const PALETTE_IMPORTERS: Importer<Palette>[] = [gplImporter, hexImporter, jascPalImporter, aseImporter, lospecJsonImporter];
