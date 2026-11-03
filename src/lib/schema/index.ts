import type { z } from "zod";
import type { CollectionName } from "@/lib/storage";
import { paletteSchema, spriteSchema, spriteSheetSchema, tilemapSchema, voxelModelSchema } from "./art";
import { dialogueSchema, musicSchema, soundSchema } from "./audio";
import { boardSchema, issueSchema } from "./board";
import { diagramSchema } from "./canvas";
import { linkSchema } from "./links";
import { projectSchema } from "./projects";
import { decisionSchema, noteSchema, storyEntrySchema } from "./text";

/** One schema per storage collection: what a row body must look like before it is written. */
export const COLLECTION_SCHEMAS: Record<CollectionName, z.ZodType> = {
  projects: projectSchema,
  sprites: spriteSchema,
  sounds: soundSchema,
  music: musicSchema,
  diagrams: diagramSchema,
  stories: storyEntrySchema,
  tilemaps: tilemapSchema,
  dialogues: dialogueSchema,
  palettes: paletteSchema,
  spritesheets: spriteSheetSchema,
  notes: noteSchema,
  boards: boardSchema,
  issues: issueSchema,
  models: voxelModelSchema,
  decisions: decisionSchema,
  links: linkSchema,
};

export type RowCheck = { ok: true } | { ok: false; errors: string[] };

/** Checks a row body against its collection's schema; errors read "path: message". */
export function validateRow(collection: CollectionName, body: unknown): RowCheck {
  const result = COLLECTION_SCHEMAS[collection].safeParse(body);
  if (result.success) return { ok: true };
  return { ok: false, errors: result.error.issues.map((issue) => `${issue.path.join(".") || collection}: ${issue.message}`) };
}

export * from "./art";
export * from "./audio";
export * from "./board";
export * from "./canvas";
export * from "./links";
export * from "./projects";
export * from "./text";
