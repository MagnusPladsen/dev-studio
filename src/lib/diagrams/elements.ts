import type { Diagram, DiagramNode } from "@/types";
import { getShape } from "@/lib/canvas-shapes";
import { linkLook } from "./cards";
import { storage } from "../storage";

const MAX_NAME_LENGTH = 60;

/** What an element is called in link lists: its first line of text (a table's name), or "Untitled <shape>". */
export function elementName(node: DiagramNode): string {
  const text = node.type === "link" ? linkLook(node).title : node.label;
  const firstLine = (text ?? "").split("\n")[0].trim();
  if (firstLine) return firstLine.length > MAX_NAME_LENGTH ? `${firstLine.slice(0, MAX_NAME_LENGTH - 1).trimEnd()}…` : firstLine;
  return `Untitled ${getShape(node.type).label.toLowerCase()}`;
}

/** The element `elementId` on canvas `diagramId`, read from `pending` when that is the canvas (an editor's unsaved copy). */
export function findElement(projectId: string, diagramId: string, elementId: string, pending?: Diagram | null): DiagramNode | undefined {
  const diagram = pending?.id === diagramId ? pending : storage.getById("diagrams", diagramId, projectId);
  return diagram?.nodes.find((node) => node.id === elementId);
}
