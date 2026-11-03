import type { AssetRef, Diagram, DiagramNode } from "@/types";
import { getShape } from "@/lib/canvas-shapes";
import { ImportError, jsonReimporter, oneOrMany } from "@/lib/import";

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value);

function isNode(value: unknown): boolean {
  return isRecord(value) && typeof value.id === "string" && typeof value.type === "string" && [value.x, value.y, value.width, value.height].every(isNumber);
}

function isEdge(value: unknown): boolean {
  return isRecord(value) && typeof value.id === "string" && typeof value.from === "string" && typeof value.to === "string";
}

function readCanvas(value: unknown): Diagram {
  if (!isRecord(value) || !Array.isArray(value.nodes) || !Array.isArray(value.edges)) {
    throw new ImportError("This isn't a canvas file. Export one from a canvas with Export → JSON.");
  }
  if (!value.nodes.every(isNode) || !value.edges.every(isEdge)) throw new ImportError("This canvas file is damaged: some cards or lines are missing their position or ends.");
  return {
    ...(value as unknown as Diagram),
    id: typeof value.id === "string" ? value.id : "canvas",
    name: typeof value.name === "string" && value.name.trim() ? value.name : "Imported canvas",
    tags: Array.isArray(value.tags) ? value.tags.filter((tag): tag is string => typeof tag === "string") : [],
  };
}

/** An element's old one-way link (`data.asset` on anything but an asset card) only survives if it points inside the file. */
function legacyLinkTarget(node: DiagramNode): AssetRef | null {
  const asset = node.data?.asset;
  return getShape(node.type).body !== "asset" && isRecord(asset) && typeof asset.id === "string" ? (asset as unknown as AssetRef) : null;
}

function withoutData(node: DiagramNode, key: string): DiagramNode {
  const data = { ...node.data };
  delete data[key];
  return { ...node, data };
}

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

/** Re-imports the Canvas's own JSON export (one canvas, or an array of them) as new canvases. */
export const canvasJsonImporter = jsonReimporter<Diagram>({
  id: "canvas-json",
  label: "Canvas JSON (.json)",
  description: "A canvas exported from here, as a new canvas",
  refKeys: ["from", "to", "fromRow", "toRow"],
  read: (data) => oneOrMany(data).map(readCanvas),
  finish(diagrams, { isImported }) {
    let droppedEdges = 0;
    let droppedLinks = 0;
    const items = diagrams.map((diagram) => {
      const nodeIds = new Set(diagram.nodes.map((node) => node.id));
      const edges = diagram.edges.filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to));
      droppedEdges += diagram.edges.length - edges.length;
      const nodes = diagram.nodes.map((node) => {
        const target = legacyLinkTarget(node);
        if (!target || isImported(target.id)) return node;
        droppedLinks++;
        return withoutData(node, "asset");
      });
      return { ...diagram, nodes, edges };
    });
    const warnings = [];
    if (droppedEdges) warnings.push(`Left out ${plural(droppedEdges, "line", "lines")} whose cards weren't in the file`);
    if (droppedLinks) warnings.push(`Left out ${plural(droppedLinks, "element link", "element links")} to assets outside the file`);
    return { items, warnings };
  },
});
