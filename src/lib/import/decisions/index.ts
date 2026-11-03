import type { Decision } from "@/types";
import type { Importer } from "@/lib/import";
import { decisionsJsonImporter } from "./decisions-json";

/** What the Decision log's Import menu offers, in menu order. Add an importer here to offer a new format. */
export const DECISION_IMPORTERS: Importer<Decision>[] = [decisionsJsonImporter];
