import type { DiagramNode } from "@/types";
import { getShape } from "@/lib/canvas-shapes";
import { createNode, insertNode } from "@/lib/canvas-shapes/create";
import { elementName } from "@/lib/diagrams/elements";
import { pruneRowLinks, tableHeight } from "@/lib/diagrams/tables";
import { linksTouchingElements } from "@/lib/links";
import { requireRef } from "../refs";
import { addFields, cardColor, patchColumns, patchItems } from "./content";
import { estimatedHeight } from "./geometry";
import type { AddOp, PlacementRequest, UpdateOp } from "./op-schema";
import { nodeOf, remember, replaceNode, type Work } from "./work";

function startingHeight(node: DiagramNode, op: AddOp): number {
  if (op.size) return Math.max(op.size.height, getShape(node.type).minSize.height);
  return estimatedHeight(node, op.items?.length ?? 0);
}

function requestPlacement(work: Work, id: string, request: PlacementRequest): void {
  if (request.at) return;
  if (request.side && !request.near) throw new Error("side needs near.");
  work.placements.set(id, { near: request.near, side: request.side, in: request.in });
}

export function addElement(work: Work, op: AddOp): void {
  if (op.asset) requireRef(work.projectId, { type: op.asset.type, id: op.asset.id });
  for (const target of op.linkTo ?? []) requireRef(work.projectId, target);
  const id = work.newId();
  const shape = getShape(op.kind);
  const created = createNode(op.kind, { x: 0, y: 0 }, { id, extra: addFields(op, shape.defaultLabel, work.newId) });
  const width = op.size ? Math.max(op.size.width, shape.minSize.width) : created.width;
  const node = { ...created, width, height: startingHeight(created, op), ...(op.at ? { x: Math.round(op.at.x), y: Math.round(op.at.y) } : {}) };
  work.diagram.nodes = insertNode(work.diagram.nodes, node);
  remember(work, op.ref, id);
  work.changed.add(id);
  requestPlacement(work, id, op);
  for (const target of op.linkTo ?? []) work.links.push({ elementId: id, to: target });
}

function withContent(work: Work, node: DiagramNode, op: UpdateOp): DiagramNode {
  if (op.columns && node.type !== "table") throw new Error(`"${elementName(node)}" is not a table.`);
  if (op.items && node.type !== "checklist") throw new Error(`"${elementName(node)}" is not a to-do list.`);
  if (op.columns) {
    const columns = patchColumns(node, op.columns, work.newId);
    work.diagram.edges = pruneRowLinks(work.diagram.edges, node.id, columns);
    return { ...node, height: tableHeight(columns.length), data: { ...node.data, columns } };
  }
  if (op.items) return { ...node, data: { ...node.data, items: patchItems(node, op.items, work.newId) } };
  return node;
}

export function updateElement(work: Work, op: UpdateOp): void {
  const node = withContent(work, nodeOf(work, op.id), op);
  const minSize = getShape(node.type).minSize;
  const next: DiagramNode = {
    ...node,
    ...(op.text !== undefined ? { label: op.text } : {}),
    ...(op.size ? { width: Math.max(op.size.width, minSize.width), height: Math.max(op.size.height, minSize.height) } : {}),
    ...(op.at ? { x: Math.round(op.at.x), y: Math.round(op.at.y) } : {}),
  };
  if (op.color === null) delete next.color;
  else if (op.color !== undefined) next.color = cardColor(op.color);
  if (next.color === undefined) delete next.color;
  replaceNode(work, next);
}

export function moveElement(work: Work, op: { id: string } & PlacementRequest): void {
  const node = nodeOf(work, op.id);
  if (!op.at && !op.near && !op.in) throw new Error("move needs at, near or in.");
  if (op.at) replaceNode(work, { ...node, x: Math.round(op.at.x), y: Math.round(op.at.y) });
  requestPlacement(work, node.id, op);
  work.changed.add(node.id);
}

/** Like Delete on the board: the element and its lines go. Elements with asset links stay, since Claude can't remove links. */
export function deleteElement(work: Work, handle: string): void {
  const node = nodeOf(work, handle);
  const links = linksTouchingElements(work.projectId, work.diagram.id, [node.id]).get(node.id) ?? [];
  if (links.length) {
    throw new Error(`"${elementName(node)}" is linked to ${links.length} asset(s). Claude can't remove links, so it stays; unlink it in the app first.`);
  }
  work.diagram.nodes = work.diagram.nodes.filter((n) => n.id !== node.id);
  const lines = work.diagram.edges.filter((e) => e.from === node.id || e.to === node.id);
  work.diagram.edges = work.diagram.edges.filter((e) => !lines.includes(e));
  work.placements.delete(node.id);
  work.links = work.links.filter((l) => l.elementId !== node.id);
  if (lines.length) work.warnings.push(`Deleting "${elementName(node)}" also removed ${lines.length} line(s).`);
}

export function groupElements(work: Work, op: { ref?: string; label: string; members: string[] }): void {
  const members = [...new Set(op.members.map((m) => nodeOf(work, m).id))];
  const id = work.newId();
  const group = { ...createNode("group", { x: 0, y: 0 }, { id }), label: op.label };
  work.diagram.nodes = insertNode(work.diagram.nodes, group);
  work.groups.push({ id, members });
  remember(work, op.ref, id);
  work.changed.add(id);
}
