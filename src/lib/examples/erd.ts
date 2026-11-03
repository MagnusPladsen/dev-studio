import type { Cardinality, DiagramEdge, DiagramNode } from "@/types";
import { tableHeight, type TableColumn } from "@/lib/diagrams/tables";

// Helpers for the example data-model canvases: ERD tables and the relation lines between their rows.

type ColumnSpec = [name: string, type: string, key?: "PK" | "FK"];

const TABLE_WIDTH = 240;
const columnId = (table: string, column: string) => `${table}-${column}`;

export function table(id: string, x: number, y: number, name: string, columns: ColumnSpec[]): DiagramNode {
  const rows = columns.map(([column, type, key]): TableColumn => ({
    id: columnId(id, column),
    name: column,
    type,
    ...(key === "PK" ? { isPrimaryKey: true } : {}),
    ...(key === "FK" ? { isForeignKey: true } : {}),
  }));
  return { id, type: "table", x, y, width: TABLE_WIDTH, height: tableHeight(rows.length), label: name, data: { columns: rows } };
}

/** A line from `from.column` to `to.column`; ends are written "table.column". */
export function relation(id: string, from: string, to: string, cardinality: Cardinality = "many-to-one"): DiagramEdge {
  const [fromTable, fromColumn] = from.split(".");
  const [toTable, toColumn] = to.split(".");
  return {
    id,
    from: fromTable,
    to: toTable,
    fromRow: columnId(fromTable, fromColumn),
    toRow: columnId(toTable, toColumn),
    label: "",
    type: "line",
    cardinality,
  };
}
