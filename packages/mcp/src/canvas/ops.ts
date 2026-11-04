import type { Diagram } from "@/types";
import { addLink } from "@/lib/links";
import { storage } from "@/lib/storage";
import type { AliasBook } from "./aliases";
import { addElement, deleteElement, groupElements, moveElement, updateElement } from "./elements";
import { connect, disconnect, updateLine } from "./lines";
import type { LayoutChoice, Op } from "./op-schema";
import { placeElements } from "./placement";
import { startWork, type Work } from "./work";

export interface EditOutcome {
  diagram: Diagram;
  refs: Record<string, string>;
  changed: Set<string>;
  warnings: string[];
}

function applyOp(work: Work, op: Op): void {
  switch (op.op) {
    case "add":
      return addElement(work, op);
    case "update":
      return updateElement(work, op);
    case "move":
      return moveElement(work, op);
    case "delete":
      return deleteElement(work, op.id);
    case "connect":
      return connect(work, op);
    case "update_line":
      return updateLine(work, op);
    case "disconnect":
      return disconnect(work, op.id);
    case "group":
      return groupElements(work, op);
  }
}

/** Runs the ops in order on a copy of the canvas and places what they left unplaced. Nothing is saved yet. */
export function applyOps(projectId: string, diagram: Diagram, ops: Op[], aliases: AliasBook, layout: LayoutChoice = "auto"): Work {
  const work = startWork(projectId, diagram, aliases);
  ops.forEach((op, index) => {
    try {
      applyOp(work, op);
    } catch (error) {
      throw new Error(`Op ${index + 1} (${op.op}): ${error instanceof Error ? error.message : String(error)} Nothing was saved.`);
    }
  });
  placeElements(work, layout);
  return work;
}

/** Applies the ops, saves the canvas into the cache and adds the asked element links (the store then writes both). */
export function editCanvas(projectId: string, diagram: Diagram, ops: Op[], aliases: AliasBook, layout?: LayoutChoice): EditOutcome {
  const work = applyOps(projectId, diagram, ops, aliases, layout);
  const saved = { ...work.diagram, updatedAt: new Date().toISOString() };
  storage.save("diagrams", saved, projectId);
  for (const link of work.links) addLink(projectId, { type: "diagram", id: saved.id, elementId: link.elementId }, link.to);
  const live = new Set([...saved.nodes, ...saved.edges].map((e) => e.id));
  return { diagram: saved, refs: Object.fromEntries(work.refs), changed: new Set([...work.changed].filter((id) => live.has(id))), warnings: work.warnings };
}
