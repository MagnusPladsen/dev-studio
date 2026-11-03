import type { Diagram } from "@/types";
import type { Importer } from "@/lib/import";
import { canvasJsonImporter } from "./canvas-json";

/** What the Canvas's Import menu offers, in menu order. Add an importer here to offer a new format. */
export const CANVAS_IMPORTERS: Importer<Diagram>[] = [canvasJsonImporter];
