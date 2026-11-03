import { describe, expect, it } from "vitest";
import { idsInside } from "@/lib/diagrams/geometry";
import { libraryTabs, placeableShapes, searchShapes } from "./library";
import { CANVAS_TEMPLATES } from "./templates";

const types = (shapes: { type: string }[]) => shapes.map((shape) => shape.type);

describe("libraryTabs", () => {
  it("should only show tabs that have shapes", () => {
    expect(libraryTabs().map((tab) => tab.id)).toEqual(["general", "flow", "database"]);
  });
});

describe("placeableShapes", () => {
  it("should leave out cards made another way", () => {
    expect(types(placeableShapes())).not.toContain("drawing");
  });
});

describe("searchShapes", () => {
  it("should list every placeable shape when the query is empty", () => {
    expect(searchShapes("  ")).toEqual(placeableShapes());
  });

  it("should put name matches before keyword matches", () => {
    expect(types(searchShapes("diamond"))[0]).toBe("diamond");
  });

  it("should find a shape by keyword", () => {
    expect(types(searchShapes("decision"))).toEqual(["diamond", "condition"]);
  });

  it("should need every word to match", () => {
    expect(types(searchShapes("to-do list"))).toEqual(["checklist"]);
  });

  it("should ignore case", () => {
    expect(types(searchShapes("NOTE"))).toEqual(["note"]);
  });

  it("should find nothing when no shape matches", () => {
    expect(searchShapes("zzz")).toEqual([]);
  });
});

describe("CANVAS_TEMPLATES", () => {
  let counter = 0;
  const makeId = () => `id-${counter++}`;

  it("should offer blank, flow chart, architecture and moodboard", () => {
    expect(CANVAS_TEMPLATES.map((t) => t.id)).toEqual(["blank", "flow-chart", "architecture", "moodboard"]);
  });

  it("should start the blank template empty", () => {
    expect(CANVAS_TEMPLATES[0].build(makeId)).toEqual({ nodes: [], edges: [] });
  });

  it("should give every card and line its own id", () => {
    for (const template of CANVAS_TEMPLATES) {
      const { nodes, edges } = template.build(makeId);
      const ids = [...nodes, ...edges].map((item) => item.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("should only draw lines between cards that exist", () => {
    for (const template of CANVAS_TEMPLATES) {
      const { nodes, edges } = template.build(makeId);
      const ids = new Set(nodes.map((n) => n.id));
      expect(edges.every((edge) => ids.has(edge.from) && ids.has(edge.to))).toBe(true);
    }
  });

  it("should keep cards on the visible part of the board", () => {
    for (const template of CANVAS_TEMPLATES) {
      expect(template.build(makeId).nodes.every((n) => n.x >= 0 && n.y >= 0)).toBe(true);
    }
  });

  it("should put groups first so they draw behind their cards", () => {
    const { nodes } = CANVAS_TEMPLATES.find((t) => t.id === "architecture")!.build(makeId);
    const firstCard = nodes.findIndex((n) => n.type !== "group");
    expect(nodes.slice(firstCard).some((n) => n.type === "group")).toBe(false);
  });

  it("should place the architecture boxes inside their groups", () => {
    const { nodes } = CANVAS_TEMPLATES.find((t) => t.id === "architecture")!.build(makeId);
    const [front, back] = nodes.filter((n) => n.type === "group");
    const boxes = nodes.filter((n) => n.type === "rectangle");
    expect([...idsInside(front, boxes), ...idsInside(back, boxes)]).toHaveLength(4);
  });
});
