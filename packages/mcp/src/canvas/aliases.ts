import type { DiagramNode } from "@/types";
import { getShape, type BodyKind } from "@/lib/canvas-shapes";

const PREFIXES: Record<BodyKind, string> = {
  table: "t",
  note: "n",
  checklist: "c",
  group: "g",
  link: "l",
  image: "i",
  asset: "a",
  drawing: "d",
  shape: "s",
};
const LINE_PREFIX = "e";

interface CanvasAliases {
  byAlias: Map<string, string>;
  byId: Map<string, string>;
  counts: Map<string, number>;
}

/**
 * Short handles (`t1`, `n2`, `e3`) for canvas elements and lines, so Claude never has to echo uuids.
 * They are given out per canvas and kept for the whole session: a handle always means the same element.
 */
export class AliasBook {
  private canvases = new Map<string, CanvasAliases>();

  private canvas(diagramId: string): CanvasAliases {
    let aliases = this.canvases.get(diagramId);
    if (!aliases) {
      aliases = { byAlias: new Map(), byId: new Map(), counts: new Map() };
      this.canvases.set(diagramId, aliases);
    }
    return aliases;
  }

  private give(diagramId: string, id: string, prefix: string): string {
    const aliases = this.canvas(diagramId);
    const known = aliases.byId.get(id);
    if (known) return known;
    const count = (aliases.counts.get(prefix) ?? 0) + 1;
    aliases.counts.set(prefix, count);
    const alias = `${prefix}${count}`;
    aliases.byAlias.set(alias, id);
    aliases.byId.set(id, alias);
    return alias;
  }

  ofNode(diagramId: string, node: DiagramNode): string {
    return this.give(diagramId, node.id, PREFIXES[getShape(node.type).body]);
  }

  ofLine(diagramId: string, edgeId: string): string {
    return this.give(diagramId, edgeId, LINE_PREFIX);
  }

  /** The real id behind a handle given out earlier, if any. */
  resolve(diagramId: string, alias: string): string | undefined {
    return this.canvases.get(diagramId)?.byAlias.get(alias);
  }
}
