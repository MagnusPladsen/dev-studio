import type { Diagram, DiagramEdge, DiagramNode } from "@/types";
import { getShape } from "@/lib/canvas-shapes";
import { checklistItems, linkUrl, nodeAsset } from "@/lib/diagrams/cards";
import { elementName } from "@/lib/diagrams/elements";
import { groupParents } from "@/lib/diagrams/auto-layout";
import { boundsOf } from "@/lib/diagrams/geometry";
import { keyLabel, tableColumns } from "@/lib/diagrams/tables";
import { fenced } from "../format";
import type { AliasBook } from "./aliases";
import { rectFor } from "./geometry";

export type OutlineDetail = "outline" | "full";

export interface OutlineNode {
  alias: string;
  id: string;
  kind: DiagramNode["type"];
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  group?: string;
  columns?: { id: string; name: string; type: string; pk?: boolean; fk?: boolean }[];
  items?: { text: string; done: boolean }[];
  url?: string;
  asset?: { type: string; id: string };
  color?: string;
  label?: string;
}

export interface OutlineLine {
  alias: string;
  id: string;
  from: string;
  to: string;
  fromRow?: string;
  toRow?: string;
  style: DiagramEdge["type"];
  label?: string;
  cardinality?: DiagramEdge["cardinality"];
}

export interface CanvasOutline {
  text: string;
  nodes: OutlineNode[];
  lines: OutlineLine[];
  bounds: { x: number; y: number; width: number; height: number } | null;
}

function columnsOf(node: DiagramNode): OutlineNode["columns"] {
  return tableColumns(node).map((c) => ({ id: c.id, name: c.name, type: c.type, ...(c.isPrimaryKey ? { pk: true } : {}), ...(c.isForeignKey ? { fk: true } : {}) }));
}

function outlineNode(diagram: Diagram, node: DiagramNode, aliases: AliasBook, group: string | undefined, detail: OutlineDetail): OutlineNode {
  const rect = rectFor(node);
  const body = getShape(node.type).body;
  const asset = nodeAsset(node);
  return {
    alias: aliases.ofNode(diagram.id, node),
    id: node.id,
    kind: node.type,
    name: elementName(node),
    x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height),
    ...(group ? { group } : {}),
    ...(body === "table" ? { columns: columnsOf(node) } : {}),
    ...(body === "checklist" ? { items: checklistItems(node).map(({ text, done }) => ({ text, done })) } : {}),
    ...(body === "link" && linkUrl(node) ? { url: linkUrl(node) } : {}),
    ...(body === "asset" && asset ? { asset: { type: asset.type, id: asset.id } } : {}),
    ...(detail === "full" ? { label: node.label, ...(node.color ? { color: node.color } : {}) } : {}),
  };
}

function outlineLine(diagram: Diagram, edge: DiagramEdge, aliasOf: Map<string, string>, aliases: AliasBook): OutlineLine {
  return {
    alias: aliases.ofLine(diagram.id, edge.id),
    id: edge.id,
    from: aliasOf.get(edge.from) ?? edge.from,
    to: aliasOf.get(edge.to) ?? edge.to,
    ...(edge.fromRow ? { fromRow: edge.fromRow } : {}),
    ...(edge.toRow ? { toRow: edge.toRow } : {}),
    style: edge.type,
    ...(edge.label ? { label: edge.label } : {}),
    ...(edge.cardinality ? { cardinality: edge.cardinality } : {}),
  };
}

function nodeText(node: OutlineNode): string {
  const at = `@(${node.x},${node.y} ${node.width}×${node.height})`;
  const head = `${node.alias} ${node.kind} "${node.name}" ${at}`;
  if (node.columns) return `${head} cols: ${node.columns.map((c) => [c.name, c.type, keyLabel({ isPrimaryKey: c.pk, isForeignKey: c.fk })].filter(Boolean).join(" ")).join(" · ") || "(none)"}`;
  if (node.items) return `${head} items: ${node.items.map((i) => `[${i.done ? "x" : " "}] ${i.text}`).join(" ") || "(none)"}`;
  if (node.url) return `${head} ${node.url}`;
  if (node.asset) return `${head} shows ${node.asset.type} ${node.asset.id}`;
  return head;
}

function rowName(nodes: Map<string, OutlineNode>, alias: string, rowId: string | undefined): string {
  if (!rowId) return alias;
  return `${alias}.${nodes.get(alias)?.columns?.find((c) => c.id === rowId)?.name ?? rowId}`;
}

function lineText(line: OutlineLine, nodes: Map<string, OutlineNode>): string {
  const ends = `${rowName(nodes, line.from, line.fromRow)} → ${rowName(nodes, line.to, line.toRow)}`;
  const style = line.cardinality ?? (line.style === "arrow" ? "" : line.style);
  return [line.alias, ends, style, line.label ? `"${line.label}"` : ""].filter(Boolean).join(" ");
}

function groupsText(nodes: OutlineNode[]): string[] {
  return nodes
    .filter((n) => n.kind === "group")
    .map((g) => `groups: ${g.alias} "${g.name}" [${nodes.filter((n) => n.group === g.alias).map((n) => n.alias).join(" ")}]`);
}

/** The compact read model: one line per element and line, with session handles instead of uuids. */
export function canvasOutline(diagram: Diagram, aliases: AliasBook, detail: OutlineDetail = "outline", only?: Set<string>): CanvasOutline {
  const parents = groupParents(diagram.nodes);
  const aliasOf = new Map(diagram.nodes.map((n) => [n.id, aliases.ofNode(diagram.id, n)]));
  const all = diagram.nodes.map((n) => outlineNode(diagram, n, aliases, aliasOf.get(parents.get(n.id) ?? ""), detail));
  const lines = diagram.edges.map((e) => outlineLine(diagram, e, aliasOf, aliases));
  const byAlias = new Map(all.map((n) => [n.alias, n]));
  const nodes = only ? all.filter((n) => only.has(n.id)) : all;
  const shownLines = only ? lines.filter((l) => only.has(l.id)) : lines;
  const head = `Canvas "${diagram.name}" (diagram ${diagram.id}, ${diagram.nodes.length} elements, ${diagram.edges.length} lines)`;
  const body = [...(only ? [] : groupsText(all)), ...nodes.map(nodeText), ...shownLines.map((l) => lineText(l, byAlias))].join("\n");
  const bounds = boundsOf(diagram.nodes.map(rectFor));
  return { text: `${head}\n${fenced(`canvas ${diagram.name}`, body || "(empty)")}`, nodes, lines: shownLines, bounds };
}
