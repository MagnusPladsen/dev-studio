import type { DiagramEdge, DiagramNode } from "@/types";
import { routeEdge, type EdgeRoute } from "@/lib/diagrams/edge-route";
import type { Rect } from "@/lib/diagrams/geometry";
import { getShape } from "./index";

function anchorY(node: DiagramNode, anchorId: string | undefined): number | undefined {
  return anchorId === undefined ? undefined : getShape(node.type).anchorY?.(node, anchorId);
}

/** The route of a line between two cards, attached to table rows where the line names them. */
export function routeFor(edge: Pick<DiagramEdge, "fromRow" | "toRow">, from: DiagramNode, to: DiagramNode, rectOf: (node: DiagramNode) => Rect): EdgeRoute {
  return routeEdge({ rect: rectOf(from), anchorY: anchorY(from, edge.fromRow) }, { rect: rectOf(to), anchorY: anchorY(to, edge.toRow) });
}
