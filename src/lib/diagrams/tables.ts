import type { Cardinality, DiagramEdge, DiagramNode } from "@/types";

/** One row of a database table card: a column with its type and key markers. */
export interface TableColumn {
  id: string;
  name: string;
  type: string;
  isPrimaryKey?: boolean;
  isForeignKey?: boolean;
}

export const TABLE_HEADER = 36;
export const TABLE_ROW = 26;
const TABLE_FOOTER = 6;

export function tableColumns(node: DiagramNode): TableColumn[] {
  const columns = node.data?.columns;
  if (!Array.isArray(columns)) return [];
  return columns.filter((c): c is TableColumn => Boolean(c) && typeof c.id === "string" && typeof c.name === "string");
}

/** A table's height follows its rows; an empty table keeps room for one. */
export function tableHeight(rowCount: number): number {
  return TABLE_HEADER + Math.max(1, rowCount) * TABLE_ROW + TABLE_FOOTER;
}

/** The vertical middle of a row on the board, or undefined when the table has no such row. */
export function rowCenterY(node: DiagramNode, rowId: string): number | undefined {
  const index = tableColumns(node).findIndex((column) => column.id === rowId);
  return index < 0 ? undefined : node.y + TABLE_HEADER + index * TABLE_ROW + TABLE_ROW / 2;
}

/** Literal colours (the exports use them too) for the PK and FK markers. */
export const KEY_COLORS = { primary: "#fbbf24", foreign: "#60a5fa" } as const;

export function keyColor(column: Pick<TableColumn, "isPrimaryKey">): string {
  return column.isPrimaryKey ? KEY_COLORS.primary : KEY_COLORS.foreign;
}

export function keyLabel(column: Pick<TableColumn, "isPrimaryKey" | "isForeignKey">): string {
  return [column.isPrimaryKey && "PK", column.isForeignKey && "FK"].filter(Boolean).join(" ");
}

const KEY_STEPS = [
  { isPrimaryKey: false, isForeignKey: false },
  { isPrimaryKey: true, isForeignKey: false },
  { isPrimaryKey: false, isForeignKey: true },
  { isPrimaryKey: true, isForeignKey: true },
];

/** Next key marking for the key button: none → PK → FK → PK FK → none. */
export function nextKey(column: TableColumn): TableColumn {
  const index = KEY_STEPS.findIndex((step) => step.isPrimaryKey === Boolean(column.isPrimaryKey) && step.isForeignKey === Boolean(column.isForeignKey));
  const next = KEY_STEPS[(index + 1) % KEY_STEPS.length];
  return { ...column, isPrimaryKey: next.isPrimaryKey || undefined, isForeignKey: next.isForeignKey || undefined };
}

/** Moves the row at `index` up (-1) or down (+1); a move past either end changes nothing. */
export function moveColumn(columns: TableColumn[], index: number, step: -1 | 1): TableColumn[] {
  const target = index + step;
  if (target < 0 || target >= columns.length) return columns;
  const next = [...columns];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** Lines lose their row when that row is deleted, and then attach to the table as a whole. */
export function pruneRowLinks(edges: DiagramEdge[], tableId: string, columns: TableColumn[]): DiagramEdge[] {
  const rows = new Set(columns.map((column) => column.id));
  return edges.map((edge) => {
    const dropFrom = edge.from === tableId && edge.fromRow !== undefined && !rows.has(edge.fromRow);
    const dropTo = edge.to === tableId && edge.toRow !== undefined && !rows.has(edge.toRow);
    if (!dropFrom && !dropTo) return edge;
    const next = { ...edge };
    if (dropFrom) delete next.fromRow;
    if (dropTo) delete next.toRow;
    return next;
  });
}

/** One end of a line being drawn: a card, and the table row when it was started or dropped on one. */
export interface LineEnd {
  id: string;
  row?: string;
}

/**
 * The line to add between two ends, or null when it would join a card to itself. A line touching a
 * table row is a relation: a plain line with crow's-foot ends, many-to-one (foreign key to key) at first.
 */
export function newLine(id: string, from: LineEnd, to: LineEnd): DiagramEdge | null {
  const isOwnRow = from.id === to.id && from.row !== undefined && to.row !== undefined && from.row !== to.row;
  if (from.id === to.id && !isOwnRow) return null;
  if (from.row === undefined && to.row === undefined) return { id, from: from.id, to: to.id, label: "", type: "arrow" };
  return {
    id,
    from: from.id,
    to: to.id,
    label: "",
    type: "line",
    cardinality: "many-to-one",
    ...(from.row !== undefined ? { fromRow: from.row } : {}),
    ...(to.row !== undefined ? { toRow: to.row } : {}),
  };
}

const CARDINALITIES: Cardinality[] = ["many-to-one", "one-to-one", "one-to-many", "many-to-many"];

export function nextCardinality(cardinality: Cardinality): Cardinality {
  return CARDINALITIES[(CARDINALITIES.indexOf(cardinality) + 1) % CARDINALITIES.length];
}

export type RelationEnd = "one" | "many";

export function cardinalityEnds(cardinality: Cardinality): [from: RelationEnd, to: RelationEnd] {
  const [from, , to] = cardinality.split("-") as [RelationEnd, string, RelationEnd];
  return [from, to];
}

export const CARDINALITY_LABELS: Record<Cardinality, string> = {
  "many-to-one": "n–1",
  "one-to-one": "1–1",
  "one-to-many": "1–n",
  "many-to-many": "n–n",
};
