import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Diagram } from "@/types";
import { runImporter } from "@/lib/import";
import { textFile } from "@/lib/import/test-helpers";
import { tableColumns } from "@/lib/diagrams/tables";
import { sqlDdlImporter } from "./sql-ddl";

async function importSql(name: string): Promise<{ canvas: Diagram; warnings: string[] }> {
  const text = readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
  const outcome = await runImporter(sqlDdlImporter, textFile(text, name, ""));
  if (!outcome.ok) throw new Error(outcome.message);
  return { canvas: outcome.result.items[0], warnings: outcome.result.warnings };
}

function tables(canvas: Diagram) {
  return Object.fromEntries(canvas.nodes.map((node) => [node.label, tableColumns(node).map((column) => [column.name, column.type, [column.isPrimaryKey && "PK", column.isForeignKey && "FK"].filter(Boolean).join(" ")])]));
}

function relations(canvas: Diagram) {
  const label = (id: string) => canvas.nodes.find((node) => node.id === id)!;
  const row = (nodeId: string, rowId?: string) => tableColumns(label(nodeId)).find((column) => column.id === rowId)?.name;
  return canvas.edges.map((edge) => `${label(edge.from).label}.${row(edge.from, edge.fromRow)} ${edge.cardinality} ${label(edge.to).label}.${row(edge.to, edge.toRow)}`);
}

describe("SQL schema import", () => {
  it("reads Postgres: quoted and schema names, types with spaces, table and ALTER TABLE keys", async () => {
    const { canvas, warnings } = await importSql("shop-postgres.sql");
    expect(canvas.name).toBe("shop-postgres");
    expect(tables(canvas)).toEqual({
      customers: [["id", "uuid", "PK"], ["email", "character varying(255)", ""], ["name", "text", ""], ["created_at", "timestamp with time zone", ""]],
      orders: [["id", "integer", "PK"], ["customer_id", "uuid", "FK"], ["total", "numeric(10, 2)", ""], ["status", "text", ""]],
      order_lines: [["order_id", "integer", "PK FK"], ["product_sku", "text", "PK"], ["quantity", "integer", ""]],
      invoices: [["id", "serial", "PK"], ["order_id", "integer", "FK"], ["vendor_id", "integer", "FK"]],
    });
    expect(relations(canvas)).toEqual([
      "orders.customer_id many-to-one customers.id",
      "order_lines.order_id many-to-one orders.id",
      "invoices.order_id one-to-one orders.id",
    ]);
    expect(warnings).toEqual(["Foreign keys to tables that aren't in the file have no line: vendors", "Skipped 3 statements that aren't tables: CREATE INDEX (2), CREATE VIEW"]);
  });

  it("reads MySQL: backticks, AUTO_INCREMENT, CHARACTER SET, KEY lines and table options", async () => {
    const { canvas, warnings } = await importSql("blog-mysql.sql");
    expect(tables(canvas)).toEqual({
      users: [["id", "int unsigned", "PK"], ["handle", "varchar(40)", ""]],
      posts: [["id", "bigint", "PK"], ["author_id", "int unsigned", "FK"], ["title", "varchar(200)", ""]],
    });
    expect(relations(canvas)).toEqual(["posts.author_id many-to-one users.id"]);
    expect(warnings).toEqual([]);
  });

  it("reads SQLite and lays the tables out in a grid", async () => {
    const { canvas, warnings } = await importSql("notes-sqlite.sql");
    expect(relations(canvas)).toEqual(["notes.notebook_id many-to-one notebooks.id"]);
    expect(warnings).toEqual(["Skipped 1 statement that isn't a table: INSERT"]);
    const [first, second] = canvas.nodes;
    expect(first.y).toBe(second.y);
    expect(second.x).toBeGreaterThan(first.x + first.width);
  });

  it("rejects SQL without tables", async () => {
    expect(await runImporter(sqlDdlImporter, textFile("SELECT 1;", "query.sql", ""))).toEqual({ ok: false, message: expect.stringContaining("no CREATE TABLE") });
  });
});
