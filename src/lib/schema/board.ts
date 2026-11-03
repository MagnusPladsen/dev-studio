import { z } from "zod";
import { id, projectRow, tags, timestamp } from "./common";

const columnCategory = z.enum(["todo", "doing", "done"]);

export const boardColumnSchema = z.looseObject({
  id,
  name: z.string(),
  color: z.string(),
  category: columnCategory,
});

export const sprintSchema = z.looseObject({
  id,
  name: z.string(),
  goal: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  state: z.enum(["planned", "active", "closed"]),
  closedAt: z.string().optional(),
  example: z.boolean().optional(),
});

const uniqueIds = (items: { id: string }[]) => new Set(items.map((item) => item.id)).size === items.length;

export const boardSchema = z
  .looseObject({
    ...projectRow,
    name: z.string(),
    keyPrefix: z.string().min(1),
    nextNumber: z.number().int().min(1),
    columns: z.array(boardColumnSchema).min(1),
    sprints: z.array(sprintSchema),
  })
  .refine((board) => uniqueIds(board.columns), { message: "Column ids must be unique", path: ["columns"] })
  .refine((board) => board.columns.some((c) => c.category === "done"), { message: "A board needs a Done column", path: ["columns"] })
  .refine((board) => board.sprints.filter((s) => s.state === "active").length <= 1, { message: "Only one sprint can be active", path: ["sprints"] });

export const ISSUE_TYPES = ["feature", "bug", "task", "art", "audio", "design", "writing", "chore", "docs"] as const;
export const ISSUE_PRIORITIES = ["lowest", "low", "medium", "high", "highest"] as const;

export const issueSchema = z.looseObject({
  ...projectRow,
  key: z.string().regex(/^[A-Za-z0-9]+-\d+$/, "Issue keys look like PIP-12"),
  title: z.string(),
  description: z.string(),
  type: z.enum(ISSUE_TYPES),
  priority: z.enum(ISSUE_PRIORITIES),
  status: id,
  sprintId: z.string().min(1).nullable(),
  points: z.number().min(0).optional(),
  dueDate: z.string().optional(),
  labels: z.array(z.string()),
  order: z.number(),
  resolvedAt: timestamp.optional(),
  archived: z.boolean().optional(),
  tags,
});
