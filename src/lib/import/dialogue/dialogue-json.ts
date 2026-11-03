import type { DialogueNode, DialogueTree } from "@/types";
import { ImportError, jsonReimporter, oneOrMany } from "@/lib/import";

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

function isNode(value: unknown): boolean {
  return isRecord(value) && typeof value.id === "string" && typeof value.type === "string" && typeof value.x === "number" && typeof value.y === "number";
}

function readTree(value: unknown): DialogueTree {
  if (!isRecord(value) || !Array.isArray(value.nodes) || !value.nodes.some((node) => isRecord(node) && node.type === "start")) {
    throw new ImportError("This isn't a dialogue file. Export one from a dialogue with Export → JSON.");
  }
  if (!value.nodes.every(isNode)) throw new ImportError("This dialogue file is damaged: some nodes are missing their position.");
  return {
    ...(value as unknown as DialogueTree),
    id: typeof value.id === "string" ? value.id : "dialogue",
    name: typeof value.name === "string" && value.name.trim() ? value.name : "Imported dialogue",
    tags: Array.isArray(value.tags) ? value.tags.filter((tag): tag is string => typeof tag === "string") : [],
  };
}

/** Unhooks `nextId` and choice targets that point at nodes missing from the file. Returns the node and how many it unhooked. */
function unhookMissing(node: DialogueNode, ids: Set<string>): [DialogueNode, number] {
  let count = 0;
  const copy = { ...node };
  if (copy.nextId && !ids.has(copy.nextId)) {
    copy.nextId = undefined;
    count++;
  }
  copy.choices = copy.choices?.map((choice) => {
    if (!choice.targetId || ids.has(choice.targetId)) return choice;
    count++;
    return { ...choice, targetId: "" };
  });
  return [copy, count];
}

/** Re-imports the Dialogue tool's own JSON export as a new dialogue tree. */
export const dialogueJsonImporter = jsonReimporter<DialogueTree>({
  id: "dialogue-json",
  label: "Dialogue JSON (.json)",
  description: "A dialogue exported from here, as a new dialogue",
  read: (data) => oneOrMany(data).map(readTree),
  finish(trees) {
    let unhooked = 0;
    const items = trees.map((tree) => {
      const ids = new Set(tree.nodes.map((node) => node.id));
      const nodes = tree.nodes.map((node) => {
        const [copy, count] = unhookMissing(node, ids);
        unhooked += count;
        return copy;
      });
      return { ...tree, nodes };
    });
    return { items, warnings: unhooked ? [`Unhooked ${unhooked} ${unhooked === 1 ? "connection" : "connections"} to nodes that weren't in the file`] : [] };
  },
});
