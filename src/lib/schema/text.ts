import { z } from "zod";
import { assetType, id, projectRow, tags } from "./common";

export const noteSchema = z.looseObject({
  ...projectRow,
  title: z.string(),
  content: z.string(),
  folder: z.string().optional(),
  pinned: z.boolean().optional(),
  tags,
});

export const STORY_ENTRY_TYPES = ["character", "location", "item", "event", "lore", "quest", "note"] as const;

export const storyEntrySchema = z.looseObject({
  ...projectRow,
  title: z.string(),
  content: z.string(),
  type: z.enum(STORY_ENTRY_TYPES),
  links: z.array(z.looseObject({ targetId: id, targetType: assetType, label: z.string().optional() })),
  tags,
});

export const DECISION_STATUSES = ["proposed", "accepted", "superseded", "deprecated", "rejected"] as const;

export const decisionSchema = z.looseObject({
  ...projectRow,
  number: z.number().int().min(1),
  title: z.string(),
  status: z.enum(DECISION_STATUSES),
  date: z.string(),
  context: z.string(),
  options: z.string(),
  decision: z.string(),
  consequences: z.string(),
  supersededBy: z.string().min(1).optional(),
  tags,
});
