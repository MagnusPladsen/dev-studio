import { z } from "zod";

/**
 * Building blocks shared by the collection schemas. Objects are loose: fields this version doesn't know
 * (written by a newer app) pass through untouched, so validating a row never drops data.
 */

export const id = z.string().min(1);
export const timestamp = z.string().min(1);
export const tags = z.array(z.string());

export const ASSET_TYPES = ["sprite", "sound", "music", "diagram", "story", "tilemap", "dialogue", "palette", "spritesheet", "note", "issue", "model", "decision"] as const;
export const assetType = z.enum(ASSET_TYPES);

/** Fields every row in a project collection carries. */
export const projectRow = {
  id,
  projectId: id,
  createdAt: timestamp,
  updatedAt: timestamp,
  /** Added by "Add examples" and removed with them; edits keep it. */
  example: z.boolean().optional(),
};

/** Rows of the art collections that were written before they had an `updatedAt`. */
export const projectRowMaybeUpdated = { ...projectRow, updatedAt: timestamp.optional() };
