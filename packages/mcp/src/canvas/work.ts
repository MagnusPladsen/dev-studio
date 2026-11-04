import type { AssetRef, Diagram, DiagramEdge, DiagramNode } from "@/types";
import { elementName } from "@/lib/diagrams/elements";
import { tableColumns, type LineEnd } from "@/lib/diagrams/tables";
import type { AliasBook } from "./aliases";
import type { PlacementRequest } from "./op-schema";

/** One `edit_canvas` call in progress: the canvas being changed and what the ops asked for. */
export interface Work {
  projectId: string;
  diagram: Diagram;
  aliases: AliasBook;
  newId: () => string;
  /** Temp refs of this call → real ids. */
  refs: Map<string, string>;
  /** Elements the server places once every op ran (adds and moves without `at`). */
  placements: Map<string, PlacementRequest>;
  /** Groups made by a `group` op: sized around their members after placement, or laid out with them when all are new. */
  groups: { id: string; members: string[] }[];
  links: { elementId: string; to: AssetRef }[];
  changed: Set<string>;
  warnings: string[];
}

export function startWork(projectId: string, diagram: Diagram, aliases: AliasBook, newId: () => string): Work {
  return {
    projectId,
    diagram: { ...diagram, nodes: [...diagram.nodes], edges: [...diagram.edges] },
    aliases,
    newId,
    refs: new Map(),
    placements: new Map(),
    groups: [],
    links: [],
    changed: new Set(),
    warnings: [],
  };
}

export function remember(work: Work, ref: string | undefined, id: string): void {
  if (!ref) return;
  if (work.refs.has(ref)) throw new Error(`ref "${ref}" is used twice in this call.`);
  work.refs.set(ref, id);
}

function realId(work: Work, handle: string): string {
  return work.refs.get(handle) ?? work.aliases.resolve(work.diagram.id, handle) ?? handle;
}

function byName(work: Work, handle: string): DiagramNode | undefined {
  const wanted = handle.trim().toLowerCase();
  const hits = work.diagram.nodes.filter((n) => elementName(n).toLowerCase() === wanted);
  if (hits.length > 1) throw new Error(`"${handle}" names ${hits.length} elements. Use a handle from get_canvas.`);
  return hits[0];
}

export function findNode(work: Work, handle: string): DiagramNode | undefined {
  const id = realId(work, handle);
  return work.diagram.nodes.find((n) => n.id === id) ?? byName(work, handle);
}

/** An element by temp ref, session handle, real id or exact name. */
export function nodeOf(work: Work, handle: string): DiagramNode {
  const node = findNode(work, handle);
  if (!node) throw new Error(`No element "${handle}" on this canvas. Use a handle from get_canvas, a ref from this call, or an element's exact name.`);
  return node;
}

export function lineOf(work: Work, handle: string): DiagramEdge {
  const id = realId(work, handle);
  const edge = work.diagram.edges.find((e) => e.id === id);
  if (!edge) throw new Error(`No line "${handle}" on this canvas.`);
  return edge;
}

function columnId(node: DiagramNode, row: string): string {
  const columns = tableColumns(node);
  const named = (name: string) => columns.find((c) => c.id === name || c.name.toLowerCase() === name.toLowerCase());
  const column = named(row) ?? named(row.slice(row.lastIndexOf(".") + 1));
  if (!column) throw new Error(`Table "${elementName(node)}" has no column "${row}".`);
  return column.id;
}

/** A line end: an element, or a table row given as `row` or as "table.column". */
export function lineEnd(work: Work, handle: string, row?: string): LineEnd {
  const dot = handle.lastIndexOf(".");
  const whole = findNode(work, handle);
  const node = whole ?? (dot > 0 ? findNode(work, handle.slice(0, dot)) : undefined);
  if (!node) throw new Error(`No element "${handle}" on this canvas.`);
  const rowName = row ?? (whole ? undefined : handle.slice(dot + 1));
  if (rowName === undefined) return { id: node.id };
  if (node.type !== "table") throw new Error(`"${elementName(node)}" is not a table, so it has no rows.`);
  return { id: node.id, row: columnId(node, rowName) };
}

export function replaceNode(work: Work, node: DiagramNode): void {
  work.diagram.nodes = work.diagram.nodes.map((n) => (n.id === node.id ? node : n));
  work.changed.add(node.id);
}
