import type { Diagram, DiagramEdge, DiagramNode } from "@/types";

/** Marks clipboard text as cards copied from a board, so pasting it rebuilds cards instead of a note. */
export const CARDS_CLIPBOARD_TYPE = "gamedev-studio/diagram-cards";

export interface CopiedCards {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
}

/** The chosen cards plus the lines that run between two of them. */
export function copyCards(diagram: Pick<Diagram, "nodes" | "edges">, ids: string[]): CopiedCards {
  const chosen = new Set(ids);
  return {
    nodes: diagram.nodes.filter((n) => chosen.has(n.id)),
    edges: diagram.edges.filter((e) => chosen.has(e.from) && chosen.has(e.to)),
  };
}

export function serializeCards(cards: CopiedCards): string {
  return JSON.stringify({ type: CARDS_CLIPBOARD_TYPE, ...cards });
}

function isNode(value: unknown): value is DiagramNode {
  const node = value as DiagramNode;
  return Boolean(node) && typeof node.id === "string" && typeof node.type === "string" && [node.x, node.y, node.width, node.height].every(Number.isFinite);
}

function isEdge(value: unknown): value is DiagramEdge {
  const edge = value as DiagramEdge;
  return Boolean(edge) && typeof edge.id === "string" && typeof edge.from === "string" && typeof edge.to === "string";
}

/** Reads cards back from clipboard text; anything else (a link, plain text) gives null. */
export function parseCards(text: string): CopiedCards | null {
  if (!text.includes(CARDS_CLIPBOARD_TYPE)) return null;
  try {
    const parsed = JSON.parse(text) as { type?: unknown; nodes?: unknown; edges?: unknown };
    if (parsed.type !== CARDS_CLIPBOARD_TYPE || !Array.isArray(parsed.nodes)) return null;
    const nodes = parsed.nodes.filter(isNode);
    const edges = Array.isArray(parsed.edges) ? parsed.edges.filter(isEdge) : [];
    return nodes.length ? { nodes, edges } : null;
  } catch {
    return null;
  }
}

/** Copies of the cards with fresh ids, moved by `offset`; lines are rewired to the copies. */
export function cloneCards(cards: CopiedCards, offset: { x: number; y: number }, makeId: () => string): CopiedCards {
  const newIds = new Map(cards.nodes.map((n) => [n.id, makeId()]));
  const nodes = cards.nodes.map((n) => ({ ...n, id: newIds.get(n.id)!, x: n.x + offset.x, y: n.y + offset.y }));
  const edges = cards.edges
    .filter((e) => newIds.has(e.from) && newIds.has(e.to))
    .map((e) => ({ ...e, id: makeId(), from: newIds.get(e.from)!, to: newIds.get(e.to)! }));
  return { nodes, edges };
}

