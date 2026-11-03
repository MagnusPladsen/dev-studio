import { describe, expect, it } from "vitest";
import type { DiagramEdge, DiagramNode } from "@/types";
import {
  cardinalityEnds,
  keyLabel,
  moveColumn,
  newLine,
  nextCardinality,
  nextKey,
  pruneRowLinks,
  rowCenterY,
  TABLE_HEADER,
  TABLE_ROW,
  tableColumns,
  tableHeight,
  type TableColumn,
} from "./tables";

const columns: TableColumn[] = [
  { id: "a", name: "id", type: "uuid", isPrimaryKey: true },
  { id: "b", name: "user_id", type: "uuid", isForeignKey: true },
  { id: "c", name: "title", type: "text" },
];
const table: DiagramNode = { id: "t", type: "table", x: 100, y: 50, width: 240, height: 0, label: "habits", data: { columns } };

describe("tableColumns", () => {
  it("should read the columns saved on the card", () => {
    expect(tableColumns(table).map((c) => c.name)).toEqual(["id", "user_id", "title"]);
  });

  it("should skip broken rows when the data came from a paste or import", () => {
    expect(tableColumns({ ...table, data: { columns: [null, { id: 1 }, columns[0]] } })).toEqual([columns[0]]);
  });

  it("should give an empty list when there are no columns", () => {
    expect(tableColumns({ ...table, data: undefined })).toEqual([]);
  });
});

describe("tableHeight", () => {
  it("should grow by one row height per column", () => {
    expect(tableHeight(4) - tableHeight(3)).toBe(TABLE_ROW);
  });

  it("should keep room for one row when the table is empty", () => {
    expect(tableHeight(0)).toBe(tableHeight(1));
  });
});

describe("rowCenterY", () => {
  it("should find the middle of a row below the header", () => {
    expect(rowCenterY(table, "b")).toBe(50 + TABLE_HEADER + TABLE_ROW + TABLE_ROW / 2);
  });

  it("should give undefined when the row was deleted", () => {
    expect(rowCenterY(table, "gone")).toBeUndefined();
  });
});

describe("keys", () => {
  it("should cycle none, PK, FK, PK FK and back", () => {
    const labels = [];
    let column: TableColumn = { id: "x", name: "x", type: "int" };
    for (let i = 0; i < 4; i++) {
      column = nextKey(column);
      labels.push(keyLabel(column));
    }
    expect(labels).toEqual(["PK", "FK", "PK FK", ""]);
  });
});

describe("moveColumn", () => {
  it("should swap a row with its neighbour", () => {
    expect(moveColumn(columns, 1, -1).map((c) => c.id)).toEqual(["b", "a", "c"]);
  });

  it("should change nothing when the row is already at the end", () => {
    expect(moveColumn(columns, 2, 1)).toBe(columns);
  });
});

describe("newLine", () => {
  it("should draw an arrow when neither end is a table row", () => {
    expect(newLine("e", { id: "a" }, { id: "b" })).toEqual({ id: "e", from: "a", to: "b", label: "", type: "arrow" });
  });

  it("should make a many-to-one relation when an end is a table row", () => {
    expect(newLine("e", { id: "a", row: "fk" }, { id: "b", row: "pk" })).toMatchObject({ type: "line", cardinality: "many-to-one", fromRow: "fk", toRow: "pk" });
  });

  it("should refuse a line from a card to itself", () => {
    expect(newLine("e", { id: "a" }, { id: "a" })).toBeNull();
  });

  it("should allow a relation between two rows of the same table", () => {
    expect(newLine("e", { id: "a", row: "x" }, { id: "a", row: "y" })).not.toBeNull();
  });
});

describe("pruneRowLinks", () => {
  const edge: DiagramEdge = { id: "e", from: "t", to: "u", type: "line", fromRow: "b", toRow: "z", cardinality: "many-to-one" };

  it("should drop the row from a line whose row was deleted", () => {
    expect(pruneRowLinks([edge], "t", columns.filter((c) => c.id !== "b"))[0]).not.toHaveProperty("fromRow");
  });

  it("should keep lines whose rows still exist", () => {
    expect(pruneRowLinks([edge], "t", columns)[0]).toBe(edge);
  });
});

describe("cardinality", () => {
  it("should cycle through all four kinds", () => {
    expect(nextCardinality(nextCardinality(nextCardinality(nextCardinality("many-to-one"))))).toBe("many-to-one");
  });

  it("should split into the from and to ends", () => {
    expect(cardinalityEnds("one-to-many")).toEqual(["one", "many"]);
  });
});
