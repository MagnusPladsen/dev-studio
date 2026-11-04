import type { Diagram } from "@/types";
import { mergeBodies } from "../sync/merge";

/**
 * Three-way merge of two edits of one canvas (for example a local nudge and elements Claude added
 * through the MCP server). Nodes and lines merge by id: additions from both sides are kept, an element
 * deleted on either side stays deleted, and within one element each field takes the side that changed
 * it (ours where both did). Lines whose card was deleted on the other side are dropped.
 */
export function mergeDiagram(base: Diagram | undefined, mine: Diagram, theirs: Diagram): Diagram {
  const merged = mergeBodies(
    base as unknown as Record<string, unknown> | undefined,
    mine as unknown as Record<string, unknown>,
    theirs as unknown as Record<string, unknown>
  ) as unknown as Diagram;
  const nodeIds = new Set(merged.nodes.map((n) => n.id));
  return {
    ...merged,
    edges: merged.edges.filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to)),
    updatedAt: mine.updatedAt > theirs.updatedAt ? mine.updatedAt : theirs.updatedAt,
  };
}
