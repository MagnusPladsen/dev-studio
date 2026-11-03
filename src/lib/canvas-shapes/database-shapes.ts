import { Table2 } from "lucide-react";
import { drawTable } from "@/lib/diagrams/png-cards";
import { tableSvg } from "@/lib/diagrams/svg-cards";
import { rowCenterY, tableColumns, tableHeight, type TableColumn } from "@/lib/diagrams/tables";
import { defineShape } from "./define";
import type { ShapeDefinition } from "./types";

const STARTING_COLUMNS = (nodeId: string): TableColumn[] => [
  { id: `${nodeId}-id`, name: "id", type: "uuid", isPrimaryKey: true },
  { id: `${nodeId}-name`, name: "name", type: "text" },
  { id: `${nodeId}-created`, name: "created_at", type: "timestamp" },
];

const table: ShapeDefinition = defineShape({
  type: "table",
  label: "Table",
  defaultLabel: "table",
  icon: Table2,
  color: "#38bdf8",
  size: { width: 240, height: tableHeight(3) },
  minSize: { width: 160, height: tableHeight(1) },
  body: "table",
  library: { section: "database", hint: "Columns with types, PK and FK", keywords: ["erd", "entity", "sql", "schema", "database", "column", "relation"] },
  defaultData: (nodeId) => ({ columns: STARTING_COLUMNS(nodeId) }),
  contentHeight: (node) => tableHeight(tableColumns(node).length),
  anchorY: rowCenterY,
  toSvg: (node, r) => tableSvg(node, r, table),
  drawPng: (ctx, node, r) => drawTable(ctx, node, r, table),
});

export const DATABASE_SHAPES = [table];
