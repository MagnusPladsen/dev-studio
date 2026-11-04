import * as z from "zod";
import { SHAPE_LIST } from "@/lib/canvas-shapes";
import type { NodeType } from "@/lib/diagrams/cards";
import { assetRefSchema } from "../refs";

export const MAX_OPS = 200;

/** Every kind the Add menu offers, except freehand drawings (§3.10: Claude doesn't draw). */
export const ADDABLE_KINDS = SHAPE_LIST.filter((s) => s.library && s.type !== "drawing").map((s) => s.type) as [NodeType, ...NodeType[]];

const handle = z.string().min(1).max(200);
const coordinate = z.number().min(-1_000_000).max(1_000_000);
const point = z.object({ x: coordinate, y: coordinate }).describe("Top-left corner on the board.");
const size = z.object({ width: z.number().min(1).max(10_000), height: z.number().min(1).max(10_000) });
const side = z.enum(["right", "below", "left", "above"]);
const style = z.enum(["arrow", "line", "dashed"]);
const cardinality = z.enum(["one-to-one", "one-to-many", "many-to-one", "many-to-many"]);
const text = z.string().max(5000);
const color = z.string().max(20).describe('A hex colour ("#4ade80") or a swatch name: red, orange, yellow, green, teal, blue, purple, pink.');

const placement = {
  at: point.optional(),
  near: handle.optional().describe("Put it beside this element (first free spot on `side`)."),
  side: side.optional().describe("Which side of `near`; default right."),
  in: handle.optional().describe("Put it inside this group; the group grows to fit."),
};

const column = z.object({ name: z.string().min(1).max(100), type: z.string().max(60).optional(), pk: z.boolean().optional(), fk: z.boolean().optional() });
const columnPatch = column.extend({
  rename: z.string().min(1).max(100).optional(),
  remove: z.boolean().optional().describe("Drops the column; lines attached to it then attach to the table."),
}).describe("Changes the column called `name`, or adds it when there is none.");
const item = z.object({ text: z.string().min(1).max(500), done: z.boolean().optional() });
const itemPatch = item.extend({ newText: z.string().min(1).max(500).optional(), remove: z.boolean().optional() }).describe("Changes the item with this text, or adds it.");

const addOp = z.object({
  op: z.literal("add"),
  ref: handle.optional().describe("A name for this element within the call, for later ops (e.g. \"users\")."),
  kind: z.enum(ADDABLE_KINDS),
  text: text.optional().describe("The card's text; a table's name; a group's or to-do list's title."),
  color: color.optional(),
  columns: z.array(column).max(100).optional().describe("kind table: its rows, in order."),
  items: z.array(item).max(100).optional().describe("kind checklist."),
  url: z.string().max(2000).optional().describe("kind link or image: an http(s) address."),
  asset: assetRefSchema.optional().describe("kind asset: the issue, note, page… the card shows."),
  size: size.optional(),
  linkTo: z.array(assetRefSchema).max(20).optional().describe("Assets to link this element to."),
  ...placement,
});

const updateOp = z.object({
  op: z.literal("update"),
  id: handle,
  text: text.optional(),
  color: color.nullable().optional().describe("null goes back to the default look."),
  columns: z.array(columnPatch).max(100).optional(),
  items: z.array(itemPatch).max(100).optional(),
  size: size.optional(),
  at: point.optional(),
});

const connectOp = z.object({
  op: z.literal("connect"),
  ref: handle.optional(),
  from: handle.describe('An element, or "table.column" for a table row.'),
  to: handle,
  fromRow: z.string().min(1).max(200).optional().describe("Column of the `from` table."),
  toRow: z.string().min(1).max(200).optional(),
  label: z.string().max(200).optional(),
  style: style.optional().describe("Default: arrow, or line for rows of tables."),
  cardinality: cardinality.optional().describe("Tables only: crow's-foot ends. Rows default to many-to-one (foreign key → key)."),
});

export const opSchema = z.discriminatedUnion("op", [
  addOp,
  updateOp,
  z.object({ op: z.literal("move"), id: handle, ...placement }),
  z.object({ op: z.literal("delete"), id: handle.describe("Drops the element and its lines. Refused while the element has asset links.") }),
  connectOp,
  z.object({ op: z.literal("update_line"), id: handle, label: z.string().max(200).optional(), style: style.optional(), cardinality: cardinality.nullable().optional() }),
  z.object({ op: z.literal("disconnect"), id: handle.describe("A line.") }),
  z.object({ op: z.literal("group"), ref: handle.optional(), label: z.string().min(1).max(200), members: z.array(handle).min(1).max(200) }),
]);

export const layoutSchema = z
  .union([
    z.enum(["auto", "none"]),
    z.object({ algorithm: z.enum(["grid", "flow", "tree", "erd"]), direction: z.enum(["right", "down"]).optional(), spacing: z.number().min(0).max(400).optional() }),
  ])
  .describe('How new elements without a position are placed: "auto" (default) picks erd/flow/tree/grid, "none" puts them in a plain grid. Elements already on the canvas never move.');

export type Op = z.infer<typeof opSchema>;
export type AddOp = z.infer<typeof addOp>;
export type UpdateOp = z.infer<typeof updateOp>;
export type ConnectOp = z.infer<typeof connectOp>;
export type ColumnPatch = z.infer<typeof columnPatch>;
export type ItemPatch = z.infer<typeof itemPatch>;
export type LayoutChoice = z.infer<typeof layoutSchema>;
export type PlacementRequest = { at?: { x: number; y: number }; near?: string; side?: "right" | "below" | "left" | "above"; in?: string };
