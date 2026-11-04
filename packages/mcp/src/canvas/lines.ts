import type { Cardinality, DiagramEdge } from "@/types";
import { newLine } from "@/lib/diagrams/tables";
import type { ConnectOp } from "./op-schema";
import { lineEnd, lineOf, remember, type Work } from "./work";

function sameEnds(a: DiagramEdge, b: DiagramEdge): boolean {
  return a.from === b.from && a.to === b.to && a.fromRow === b.fromRow && a.toRow === b.toRow;
}

function isBetweenTables(work: Work, edge: Pick<DiagramEdge, "from" | "to">): boolean {
  const table = (id: string) => work.diagram.nodes.find((n) => n.id === id)?.type === "table";
  return table(edge.from) && table(edge.to);
}

function withCardinality(work: Work, edge: DiagramEdge, cardinality: Cardinality | null | undefined): DiagramEdge {
  if (cardinality === undefined) return edge;
  const next = { ...edge };
  if (cardinality === null) delete next.cardinality;
  else if (!isBetweenTables(work, edge)) throw new Error("cardinality only works on lines between two tables.");
  else next.cardinality = cardinality;
  return next;
}

/** A line made the way the board makes one (`newLine`): a row-to-row line is a many-to-one relation. */
export function connect(work: Work, op: ConnectOp): void {
  const drawn = newLine(work.newId(), lineEnd(work, op.from, op.fromRow), lineEnd(work, op.to, op.toRow));
  if (!drawn) throw new Error(`Can't connect "${op.from}" to itself.`);
  const existing = work.diagram.edges.find((e) => sameEnds(e, drawn));
  if (existing) {
    work.warnings.push(`${op.from} → ${op.to} was already connected; kept the existing line.`);
    remember(work, op.ref, existing.id);
    return;
  }
  const styled = { ...drawn, ...(op.style ? { type: op.style } : {}), ...(op.label ? { label: op.label } : {}) };
  work.diagram.edges = [...work.diagram.edges, withCardinality(work, styled, op.cardinality)];
  remember(work, op.ref, drawn.id);
  work.changed.add(drawn.id);
}

export function updateLine(work: Work, op: { id: string; label?: string; style?: DiagramEdge["type"]; cardinality?: Cardinality | null }): void {
  const edge = lineOf(work, op.id);
  const styled = { ...edge, ...(op.label !== undefined ? { label: op.label } : {}), ...(op.style ? { type: op.style } : {}) };
  const next = withCardinality(work, styled, op.cardinality);
  work.diagram.edges = work.diagram.edges.map((e) => (e.id === edge.id ? next : e));
  work.changed.add(edge.id);
}

export function disconnect(work: Work, handle: string): void {
  const edge = lineOf(work, handle);
  work.diagram.edges = work.diagram.edges.filter((e) => e.id !== edge.id);
}
