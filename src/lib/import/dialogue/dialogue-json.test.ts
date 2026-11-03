import { describe, expect, it } from "vitest";
import type { DialogueTree } from "@/types";
import { planningExamples } from "@/lib/examples/planning";
import { runImporter } from "@/lib/import";
import { differenceIgnoringIds, textFile } from "@/lib/import/test-helpers";
import { dialogueJsonImporter } from "./dialogue-json";

const ctx = { projectId: "p", id: (slug: string) => `p--ex--${slug}` };
const exampleTrees = planningExamples
  .filter((module) => module.collection === "dialogues")
  .flatMap((module) => module.build(ctx) as unknown as DialogueTree[])
  .map((tree) => ({ ...tree, projectId: "p", tags: [], createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }));

describe("Dialogue JSON import", () => {
  it.each(exampleTrees.map((tree) => [tree.name, tree] as const))("round-trips the %s example with new ids", async (_name, tree) => {
    const outcome = await runImporter(dialogueJsonImporter, textFile(JSON.stringify(tree, null, 2)));
    if (!outcome.ok) throw new Error(outcome.message);
    const [copy] = outcome.result.items;
    expect(outcome.result.warnings).toEqual([]);
    expect(differenceIgnoringIds(tree, copy)).toBeNull();
    expect(copy.nodes.some((node) => tree.nodes.some((old) => old.id === node.id))).toBe(false);
  });

  it("unhooks connections to missing nodes and rejects other files", async () => {
    const tree = { name: "Bits", nodes: [{ id: "s", type: "start", x: 0, y: 0, nextId: "gone" }] };
    const outcome = await runImporter(dialogueJsonImporter, textFile(JSON.stringify(tree)));
    expect(outcome.ok && outcome.result.items[0].nodes[0].nextId).toBeUndefined();
    expect(outcome.ok && outcome.result.warnings).toHaveLength(1);
    expect(await runImporter(dialogueJsonImporter, textFile(JSON.stringify({ nodes: [], edges: [] })))).toEqual({ ok: false, message: expect.stringContaining("isn't a dialogue file") });
  });
});
