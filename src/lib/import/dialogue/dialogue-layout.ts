import type { DialogueNode } from "@/types";

const COLUMN_WIDTH = 280;
const ROW_GAP = 40;
const ORIGIN = { x: 100, y: 100 };

/** The editor's node heights (see the Dialogue page), so stacked nodes never overlap. */
function nodeHeight(node: DialogueNode): number {
  if (node.type === "start" || node.type === "end") return 60;
  if (node.type === "choice") return 80 + (node.choices?.length || 1) * 28;
  if (node.type === "condition") return 80;
  return 90;
}

const successors = (node: DialogueNode) => [node.nextId, node.elseId, ...(node.choices ?? []).map((choice) => choice.targetId)].filter((id): id is string => !!id);

/**
 * Lays nodes out left to right: one column per step from the first node, nodes stacked in the order they are reached.
 * Nodes nothing leads to start their own run in the second column.
 */
export function layOutDialogue(nodes: DialogueNode[]): DialogueNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const depth = new Map<string, number>();
  const order: string[] = [];
  const visit = (rootId: string, rootDepth: number) => {
    const queue = [rootId];
    depth.set(rootId, rootDepth);
    while (queue.length) {
      const id = queue.shift()!;
      order.push(id);
      for (const next of successors(byId.get(id)!)) {
        if (depth.has(next) || !byId.has(next)) continue;
        depth.set(next, depth.get(id)! + 1);
        queue.push(next);
      }
    }
  };
  for (const node of nodes) {
    if (depth.has(node.id)) continue;
    visit(node.id, node === nodes[0] ? 0 : 1);
  }

  const columnBottom = new Map<number, number>();
  const placed = new Map<string, { x: number; y: number }>();
  for (const id of order) {
    const column = depth.get(id)!;
    const y = columnBottom.get(column) ?? ORIGIN.y;
    placed.set(id, { x: ORIGIN.x + column * COLUMN_WIDTH, y });
    columnBottom.set(column, y + nodeHeight(byId.get(id)!) + ROW_GAP);
  }
  return nodes.map((node) => ({ ...node, ...placed.get(node.id)! }));
}
