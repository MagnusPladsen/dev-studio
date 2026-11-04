import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Diagram } from "@/types";
import { getShape, SHAPES } from "@/lib/canvas-shapes";
import { routeFor } from "@/lib/canvas-shapes/routes";
import { migrateElementAssetLinks } from "@/lib/diagrams/element-links";
import { renderDiagramSvg } from "@/lib/diagrams/render-svg";
import { rowCenterY, tableColumns } from "@/lib/diagrams/tables";
import { runImporter } from "@/lib/import";
import { canvasJsonImporter } from "@/lib/import/canvas/canvas-json";
import { textFile } from "@/lib/import/test-helpers";
import { validateRow } from "@/lib/schema";
import { replaceCache, storage } from "@/lib/storage";
import { DATA_MODEL_FIXTURE } from "../testing/data-model";

// Opens the data model the canvas tools built (saved by `tools/canvas.test.ts`) with the app's own canvas code.
const text = readFileSync(DATA_MODEL_FIXTURE, "utf8");
const diagram = JSON.parse(text) as Diagram;
const rectOf = (node: Diagram["nodes"][number]) => ({ x: node.x, y: node.y, width: node.width, height: getShape(node.type).contentHeight?.(node) ?? node.height });

describe("a canvas built by the MCP, opened by the app", () => {
  it("passes the row schema the app and the database check", () => {
    expect(validateRow("diagrams", diagram)).toEqual({ ok: true });
  });

  it("uses only shapes the board knows, so nothing falls back to a note", () => {
    for (const node of diagram.nodes) expect(SHAPES[node.type]).toBeDefined();
  });

  it("attaches every relation line to existing table rows", () => {
    const byId = new Map(diagram.nodes.map((n) => [n.id, n]));
    for (const edge of diagram.edges) {
      const [from, to] = [byId.get(edge.from)!, byId.get(edge.to)!];
      expect(rowCenterY(from, edge.fromRow!)).toBeDefined();
      expect(rowCenterY(to, edge.toRow!)).toBeDefined();
      const { points } = routeFor(edge, from, to, rectOf);
      expect(points[0].y).toBe(rowCenterY(from, edge.fromRow!));
      expect(points[points.length - 1].y).toBe(rowCenterY(to, edge.toRow!));
    }
  });

  it("opens in the editor's storage with nothing to migrate", () => {
    replaceCache(new Map());
    storage.save("diagrams", diagram, diagram.projectId);
    expect(migrateElementAssetLinks(diagram.projectId)).toBe(0);
    expect(storage.getById("diagrams", diagram.id, diagram.projectId)?.nodes).toHaveLength(diagram.nodes.length);
  });

  it("re-imports through Import → Canvas JSON without warnings", async () => {
    const outcome = await runImporter(canvasJsonImporter, textFile(text, "data-model.canvas.json"));
    if (!outcome.ok) throw new Error(outcome.message);
    expect(outcome.result.warnings).toEqual([]);
    expect(outcome.result.items[0].edges).toHaveLength(diagram.edges.length);
  });

  it("exports to SVG with every table, column and crow's foot", () => {
    const svg = renderDiagramSvg({ diagram, rectOf, describeAsset: () => null });
    expect(svg.startsWith("<svg")).toBe(true);
    for (const table of diagram.nodes.filter((n) => n.type === "table")) {
      expect(svg).toContain(`>${table.label}<`);
      for (const column of tableColumns(table)) expect(svg).toContain(column.name);
    }
    expect(svg.match(/stroke-linecap="round"/g)?.length ?? 0).toBeGreaterThanOrEqual(diagram.edges.length * 2);
  });
});
