import type { DiagramNode } from "@/types";
import type { NodeType } from "@/lib/diagrams/cards";
import type { Point } from "@/lib/diagrams/geometry";
import { getShape } from "./index";

export interface NewNodeOptions {
  id: string;
  /** Shifts the card down and right, so cards added in a row don't land exactly on top of each other. */
  cascade?: number;
  /** Fields to set on the new card; a `width` replaces the default width, the height always starts at the default. */
  extra?: Partial<DiagramNode>;
}

/** A new card of `type`, centred on `center`, with its kind's default size and label. */
export function createNode(type: NodeType, center: Point, { id, cascade = 0, extra = {} }: NewNodeOptions): DiagramNode {
  const shape = getShape(type);
  const size = { ...shape.size, ...(extra.width ? { width: extra.width } : {}) };
  return {
    id,
    type,
    label: shape.defaultLabel,
    ...(shape.defaultData ? { data: shape.defaultData(id) } : {}),
    ...extra,
    x: Math.round(center.x - size.width / 2 + cascade),
    y: Math.round(center.y - size.height / 2 + cascade),
    ...size,
  };
}

/** Adds a card on its layer: containers go to the back so the cards inside them stay on top. */
export function insertNode(nodes: DiagramNode[], node: DiagramNode): DiagramNode[] {
  return getShape(node.type).layer === "back" ? [node, ...nodes] : [...nodes, node];
}
