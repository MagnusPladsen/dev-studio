import { v4 as uuid } from "uuid";
import type { DiagramNode } from "@/types";
import { CARD_COLORS, checklistItems, linkCardSize, safeWebUrl, type ChecklistItem } from "@/lib/diagrams/cards";
import { tableColumns, type TableColumn } from "@/lib/diagrams/tables";
import type { AddOp, ColumnPatch, ItemPatch } from "./op-schema";

const HEX = /^#[0-9a-f]{3}([0-9a-f]{3})?([0-9a-f]{2})?$/i;
const MIN_TABLE_WIDTH = 240;
const MAX_TABLE_WIDTH = 480;
const CHAR_WIDTH = 7;

/** A swatch name ("green") or a hex colour; anything else is refused so no odd strings reach the board. */
export function cardColor(value: string): string | undefined {
  if (value.toLowerCase() === "default") return undefined;
  if (HEX.test(value)) return value.toLowerCase();
  const swatch = CARD_COLORS.find((c) => c.name.toLowerCase() === value.toLowerCase());
  if (!swatch) throw new Error(`Colour "${value}" isn't a hex colour or one of ${CARD_COLORS.map((c) => c.name.toLowerCase()).join(", ")}.`);
  return swatch.value;
}

export function newColumn(spec: { name: string; type?: string; pk?: boolean; fk?: boolean }): TableColumn {
  return { id: uuid(), name: spec.name, type: spec.type ?? "text", ...(spec.pk ? { isPrimaryKey: true } : {}), ...(spec.fk ? { isForeignKey: true } : {}) };
}

/** Wide enough for the longest "name type" row, like the SQL import makes them. */
export function tableWidth(name: string, columns: TableColumn[]): number {
  const longest = Math.max(name.length, ...columns.map((c) => c.name.length + c.type.length + 6));
  return Math.min(MAX_TABLE_WIDTH, Math.max(MIN_TABLE_WIDTH, Math.round(longest * CHAR_WIDTH + 48)));
}

function patchedColumn(column: TableColumn, patch: ColumnPatch): TableColumn {
  const next: TableColumn = { ...column, name: patch.rename ?? column.name, type: patch.type ?? column.type };
  if (patch.pk !== undefined) next.isPrimaryKey = patch.pk || undefined;
  if (patch.fk !== undefined) next.isForeignKey = patch.fk || undefined;
  return next;
}

export function patchColumns(node: DiagramNode, patches: ColumnPatch[]): TableColumn[] {
  return patches.reduce((columns, patch) => {
    const index = columns.findIndex((c) => c.name.toLowerCase() === patch.name.toLowerCase());
    if (index < 0) return patch.remove ? columns : [...columns, newColumn(patch)];
    if (patch.remove) return columns.filter((_, i) => i !== index);
    return columns.map((c, i) => (i === index ? patchedColumn(c, patch) : c));
  }, tableColumns(node));
}

export function patchItems(node: DiagramNode, patches: ItemPatch[]): ChecklistItem[] {
  return patches.reduce((items, patch) => {
    const index = items.findIndex((i) => i.text === patch.text);
    if (index < 0) return patch.remove ? items : [...items, { id: uuid(), text: patch.text, done: patch.done ?? false }];
    if (patch.remove) return items.filter((_, i) => i !== index);
    return items.map((item, i) => (i === index ? { ...item, text: patch.newText ?? item.text, done: patch.done ?? item.done } : item));
  }, checklistItems(node));
}

function webUrl(op: AddOp): string {
  const url = op.url && safeWebUrl(op.url);
  if (!url) throw new Error(`A ${op.kind} card needs an http(s) url.`);
  return url;
}

function refuseStrayFields(op: AddOp): void {
  if (op.columns && op.kind !== "table") throw new Error("columns only work with kind table.");
  if (op.items && op.kind !== "checklist") throw new Error("items only work with kind checklist.");
  if (op.url && op.kind !== "link" && op.kind !== "image") throw new Error("url only works with kind link or image.");
  if (op.asset && op.kind !== "asset") throw new Error("asset only works with kind asset.");
}

/** The fields `createNode` takes for an add: label, colour, and the data its kind keeps. */
export function addFields(op: AddOp, defaultLabel: string): Partial<DiagramNode> {
  refuseStrayFields(op);
  const label = op.text ?? defaultLabel;
  const base: Partial<DiagramNode> = { label, ...(op.color ? { color: cardColor(op.color) } : {}) };
  if (op.kind === "table" && op.columns) {
    const columns = op.columns.map(newColumn);
    return { ...base, width: tableWidth(label, columns), data: { columns } };
  }
  if (op.kind === "checklist") return { ...base, data: { items: (op.items ?? []).map((i) => ({ id: uuid(), text: i.text, done: i.done ?? false })) } };
  if (op.kind === "link") return { ...base, label: op.text ?? "", width: linkCardSize(webUrl(op)).width, data: { url: webUrl(op) } };
  if (op.kind === "image") return { ...base, data: { src: webUrl(op) } };
  if (op.kind === "asset") {
    if (!op.asset) throw new Error("A kind asset card needs asset: { type, id }.");
    return { ...base, data: { asset: { type: op.asset.type, id: op.asset.id } } };
  }
  return base;
}
