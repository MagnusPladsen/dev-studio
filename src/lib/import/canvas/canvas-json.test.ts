import { describe, expect, it } from "vitest";
import type { Diagram } from "@/types";
import { planningExamples } from "@/lib/examples/planning";
import { devStudioExamples } from "@/lib/examples/dev-studio";
import { runImporter } from "@/lib/import";
import { differenceIgnoringIds, textFile } from "@/lib/import/test-helpers";
import { canvasJsonImporter } from "./canvas-json";

const ctx = { projectId: "p", id: (slug: string) => `p--ex--${slug}` };
const exampleCanvases = [...planningExamples, ...devStudioExamples]
  .filter((module) => module.collection === "diagrams")
  .flatMap((module) => module.build(ctx) as unknown as Diagram[])
  .map((diagram) => ({ ...diagram, projectId: "p", tags: [], createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }));

/** What Export → JSON writes (see `exportJson` in `src/lib/diagrams/export-files.ts`). */
const exported = (diagram: Diagram) => textFile(JSON.stringify(diagram, null, 2), `${diagram.name}.canvas.json`);

async function importCanvas(text: string) {
  return runImporter(canvasJsonImporter, textFile(text));
}

describe("Canvas JSON import", () => {
  it.each(exampleCanvases.map((diagram) => [diagram.name, diagram] as const))("round-trips the %s example with new ids", async (_name, diagram) => {
    const outcome = await runImporter(canvasJsonImporter, exported(diagram));
    if (!outcome.ok) throw new Error(outcome.message);
    const [copy] = outcome.result.items;
    expect(outcome.result.warnings).toEqual([]);
    expect(differenceIgnoringIds(diagram, copy, ["from", "to", "fromRow", "toRow"])).toBeNull();
    expect(copy.id).not.toBe(diagram.id);
    const oldIds = new Set([...diagram.nodes, ...diagram.edges].map((element) => element.id));
    expect([...copy.nodes, ...copy.edges].some((element) => oldIds.has(element.id))).toBe(false);
  });

  it("covers every example canvas of both apps", () => {
    expect(exampleCanvases.length).toBeGreaterThanOrEqual(8);
  });

  it("imports an array of canvases", async () => {
    const outcome = await importCanvas(JSON.stringify(exampleCanvases.slice(0, 2)));
    expect(outcome.ok && outcome.result.items.length).toBe(2);
  });

  it("rejects files that aren't JSON or aren't canvases, in plain words", async () => {
    const notJson = await importCanvas("{ nodes: [");
    expect(notJson).toEqual({ ok: false, message: expect.stringContaining("isn't valid JSON") });
    const notCanvas = await importCanvas(JSON.stringify({ name: "Hero", frames: [] }));
    expect(notCanvas).toEqual({ ok: false, message: expect.stringContaining("isn't a canvas file") });
    const damaged = await importCanvas(JSON.stringify({ nodes: [{ id: "a", type: "note" }], edges: [] }));
    expect(damaged).toEqual({ ok: false, message: expect.stringContaining("damaged") });
    expect(await importCanvas("null")).toMatchObject({ ok: false });
  });

  it("drops lines and element links that point outside the file, with a warning", async () => {
    const file = {
      name: "Partial",
      nodes: [
        { id: "a", type: "note", x: 0, y: 0, width: 100, height: 60, label: "A", data: { asset: { type: "sprite", id: "missing" } } },
        { id: "b", type: "asset", x: 0, y: 0, width: 100, height: 60, label: "Hero", data: { asset: { type: "sprite", id: "hero" } } },
      ],
      edges: [
        { id: "e1", from: "a", to: "b", type: "arrow" },
        { id: "e2", from: "a", to: "gone", type: "arrow" },
      ],
    };
    const outcome = await importCanvas(JSON.stringify(file));
    if (!outcome.ok) throw new Error(outcome.message);
    const [copy] = outcome.result.items;
    expect(copy.edges).toHaveLength(1);
    expect(copy.nodes[0].data?.asset).toBeUndefined();
    expect(copy.nodes[1].data?.asset).toEqual({ type: "sprite", id: "hero" });
    expect(copy.tags).toEqual([]);
    expect(outcome.result.warnings).toHaveLength(2);
  });

  it("is picked for canvas files when dropped", () => {
    expect(canvasJsonImporter.detect?.(textFile(""), JSON.stringify(exampleCanvases[0]))).toBe(true);
    expect(canvasJsonImporter.detect?.(textFile(""), JSON.stringify({ issues: [] }))).toBe(false);
  });
});
