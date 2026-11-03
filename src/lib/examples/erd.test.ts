import { describe, expect, it } from "vitest";
import type { Diagram } from "@/types";
import { tableColumns } from "@/lib/diagrams/tables";
import { devStudioExamples } from "./dev-studio";
import { relation, table } from "./erd";
import { planningExamples } from "./planning";
import type { ExampleModule } from "./types";

const ctx = { projectId: "p", id: (slug: string) => `p--ex--${slug}` };
const canvasesOf = (modules: ExampleModule[]) =>
  modules.filter((m) => m.collection === "diagrams").flatMap((m) => m.build(ctx) as unknown as Diagram[]);
const canvases = [...canvasesOf(planningExamples), ...canvasesOf(devStudioExamples)];

describe("table", () => {
  it("should give each column an id from the table and column name", () => {
    expect(tableColumns(table("users", 0, 0, "users", [["id", "uuid", "PK"]]))[0].id).toBe("users-id");
  });

  it("should mark primary and foreign keys", () => {
    const columns = tableColumns(table("t", 0, 0, "t", [["id", "uuid", "PK"], ["user_id", "uuid", "FK"], ["name", "text"]]));
    expect(columns.map((c) => [!!c.isPrimaryKey, !!c.isForeignKey])).toEqual([[true, false], [false, true], [false, false]]);
  });
});

describe("relation", () => {
  it("should attach both ends to their rows", () => {
    const edge = relation("e1", "habits.user_id", "users.id");
    expect([edge.from, edge.fromRow, edge.to, edge.toRow]).toEqual(["habits", "habits-user_id", "users", "users-id"]);
  });
});

describe("example data-model canvases", () => {
  it("should include a data model for each app", () => {
    expect(canvases.map((c) => c.name)).toEqual(expect.arrayContaining(["Data Model", "Save Data"]));
  });

  it("should attach every relation line to a row that exists", () => {
    for (const canvas of canvases) {
      const rowsOf = (id: string) => tableColumns(canvas.nodes.find((n) => n.id === id)!).map((c) => c.id);
      for (const edge of canvas.edges.filter((e) => e.cardinality)) {
        expect(rowsOf(edge.from), `${canvas.name}: ${edge.id}`).toContain(edge.fromRow);
        expect(rowsOf(edge.to), `${canvas.name}: ${edge.id}`).toContain(edge.toRow);
      }
    }
  });
});
