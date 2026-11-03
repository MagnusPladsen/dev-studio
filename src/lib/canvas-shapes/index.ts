import type { DiagramNode } from "@/types";
import type { NodeType } from "@/lib/diagrams/cards";
import type { Rect } from "@/lib/diagrams/geometry";
import type { ShapeOutline } from "@/lib/diagrams/shapes";
import { BASIC_SHAPES } from "./basic-shapes";
import { BOARD_CARDS } from "./board-cards";
import { FLOW_SHAPES } from "./flow-shapes";
import type { ShapeDefinition } from "./types";

export type { BodyKind, LibrarySection, Placement, ShapeDefinition } from "./types";

/**
 * Every kind of Canvas card, in the order the Add menu lists them. A new shape is one more definition
 * here (plus a body component if it needs a new `BodyKind`); the page reads everything else from it.
 */
export const SHAPE_LIST: readonly ShapeDefinition[] = [...BOARD_CARDS, ...BASIC_SHAPES, ...FLOW_SHAPES];

export const SHAPES = Object.fromEntries(SHAPE_LIST.map((shape) => [shape.type, shape])) as Record<NodeType, ShapeDefinition>;

const FALLBACK = SHAPES.note;

/** A card type saved by a newer or broken copy of the app falls back to a note, so the board still opens. */
export function getShape(type: string): ShapeDefinition {
  return SHAPES[type as NodeType] ?? FALLBACK;
}

/** The card's own colour, or its kind's default. */
export function shapeColor(node: DiagramNode): string {
  return node.color ?? getShape(node.type).color;
}

/** The outline a shape card draws in its box, shared by the board, the PNG and the SVG export. */
export function outlineOf(type: NodeType, r: Rect): ShapeOutline {
  const outline = getShape(type).outline;
  return outline ? outline(r) : { kind: "rect", ...r, radius: 4 };
}
