import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Diagram } from "@/types";
import { findImporter, runImporter } from "@/lib/import";
import { textFile } from "@/lib/import/test-helpers";
import { CANVAS_IMPORTERS } from "./index";
import { excalidrawImporter } from "./excalidraw";

const drawing = readFileSync(new URL("./fixtures/flow.excalidraw", import.meta.url), "utf8");

async function importDrawing(): Promise<{ canvas: Diagram; warnings: string[] }> {
  const outcome = await runImporter(excalidrawImporter, textFile(drawing, "Menu flow.excalidraw", ""));
  if (!outcome.ok) throw new Error(outcome.message);
  return { canvas: outcome.result.items[0], warnings: outcome.result.warnings };
}

describe("Excalidraw import", () => {
  it("turns shapes, bound text, frames, text and images into cards", async () => {
    const { canvas } = await importDrawing();
    expect(canvas.name).toBe("Menu flow");
    const byLabel = (label: string) => canvas.nodes.find((node) => node.label === label)!;
    expect(byLabel("Title screen")).toMatchObject({ type: "ellipse", color: "#b2f2bb", width: 140, height: 70 });
    expect(byLabel("Has a save?")).toMatchObject({ type: "diamond", color: "#1971c2" });
    expect(byLabel("Loose note").type).toBe("note");
    expect(canvas.nodes[0]).toMatchObject({ type: "group", label: "Menu flow", x: 40, y: 40 });
    const box = canvas.nodes.find((node) => node.type === "rectangle")!;
    expect(box.color).toBeUndefined();
    expect(box.width).toBeGreaterThanOrEqual(80);
    expect(canvas.nodes.find((node) => node.type === "image")?.data).toMatchObject({ src: expect.stringMatching(/^data:image\/png/), aspect: 2 });
    expect(canvas.nodes.filter((node) => node.type === "drawing")).toHaveLength(2);
    expect(canvas.nodes.find((node) => node.type === "drawing" && node.color === "#e03131")).toBeDefined();
  });

  it("turns bound arrows into lines and keeps their labels and direction", async () => {
    const { canvas } = await importDrawing();
    const id = (label: string) => canvas.nodes.find((node) => node.label === label)!.id;
    expect(canvas.edges).toHaveLength(2);
    expect(canvas.edges[0]).toMatchObject({ from: id("Title screen"), to: id("Has a save?"), label: "Start", type: "arrow" });
    expect(canvas.edges[1]).toMatchObject({ to: id("Has a save?"), type: "dashed" });
  });

  it("lists what it couldn't bring over", async () => {
    const { warnings } = await importDrawing();
    expect(warnings).toEqual([
      "1 arrow wasn't attached to two shapes, so it was drawn as a line without a head",
      "1 rotated shape was placed straight",
      "Left out 1 image whose picture wasn't saved in the file",
      "Left out elements the Canvas has no card for: embeddable",
    ]);
  });

  it("is picked for Excalidraw JSON dropped as .json, and rejects other JSON", async () => {
    expect((await findImporter(CANVAS_IMPORTERS, textFile(drawing, "flow.json")))?.id).toBe("canvas-excalidraw");
    expect(await runImporter(excalidrawImporter, textFile('{"nodes":[]}', "x.excalidraw"))).toEqual({ ok: false, message: expect.stringContaining("isn't an Excalidraw drawing") });
  });
});
