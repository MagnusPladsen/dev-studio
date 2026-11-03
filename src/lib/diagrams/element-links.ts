import type { Diagram, DiagramNode } from "@/types";
import { getShape } from "@/lib/canvas-shapes";
import { ASSET_KINDS } from "../assets";
import { addLink } from "../links";
import { storage } from "../storage";
import { nodeAsset } from "./cards";

/** Asset cards *show* an asset through `data.asset`; on any other element the field was the old one-way link. */
function hasLegacyLink(node: DiagramNode): boolean {
  return getShape(node.type).body !== "asset" && Boolean(nodeAsset(node));
}

function withoutLegacyLink(node: DiagramNode): DiagramNode {
  if (!hasLegacyLink(node)) return node;
  const data = { ...node.data };
  delete data.asset;
  return { ...node, data };
}

function migrateDiagram(projectId: string, diagram: Diagram): number {
  const legacy = diagram.nodes.filter(hasLegacyLink);
  for (const node of legacy) {
    const asset = nodeAsset(node)!;
    const exists = ASSET_KINDS[asset.type] && storage.getById(ASSET_KINDS[asset.type].collection, asset.id, projectId);
    if (exists) addLink(projectId, { type: "diagram", id: diagram.id, elementId: node.id }, { type: asset.type, id: asset.id });
  }
  // Keeps `updatedAt`: the canvas looks as it did, so it shouldn't count as edited.
  storage.save("diagrams", { ...diagram, nodes: diagram.nodes.map(withoutLegacyLink) }, projectId);
  return legacy.length;
}

/**
 * Turns each element's old `data.asset` link into a real element link and drops the field. Running it again finds
 * nothing to do, and `addLink` never doubles a link, so it is safe on every load and after every sync.
 * Returns how many elements were moved over.
 */
export function migrateElementAssetLinks(projectId: string): number {
  return storage
    .getAll("diagrams", projectId)
    .filter((diagram) => diagram.nodes.some(hasLegacyLink))
    .reduce((count, diagram) => count + migrateDiagram(projectId, diagram), 0);
}

export function migrateAllElementAssetLinks(): number {
  return storage.getAll("projects").reduce((count, project) => count + migrateElementAssetLinks(project.id), 0);
}
