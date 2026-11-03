import { v4 as uuid } from "uuid";
import type { Cardinality, Diagram, DiagramEdge, DiagramNode } from "@/types";
import { tableHeight, type TableColumn } from "@/lib/diagrams/tables";
import { ImportError, type Importer } from "@/lib/import";

/** A table as read from `CREATE TABLE`, before it becomes a card. */
interface SqlTable {
  name: string;
  columns: (TableColumn & { isUnique?: boolean })[];
  /** Column-name lists that are unique on their own (PRIMARY KEY or UNIQUE), for one-to-one relations. */
  uniqueSets: string[][];
  foreignKeys: SqlForeignKey[];
}

interface SqlForeignKey {
  columns: string[];
  table: string;
  /** Empty when the statement leaves them out: then the other table's primary key is meant. */
  references: string[];
}

const GRID_GAP_X = 80;
const GRID_GAP_Y = 60;
const MARGIN = 40;
const MIN_TABLE_WIDTH = 220;
const CHAR_WIDTH = 7.2;

/** Words that end a column's type and start its constraints. */
const COLUMN_CONSTRAINTS = new Set([
  "not", "null", "default", "primary", "references", "unique", "check", "constraint", "auto_increment", "autoincrement", "collate",
  "generated", "comment", "on", "charset", "identity", "as", "stored", "virtual", "invisible", "visible",
]);
const TABLE_CONSTRAINTS = /^(primary\s+key|foreign\s+key|unique|key|index|fulltext|spatial|check|exclude|period\s+for)\b/i;

/** `"public"."Users"`, `` `users` `` or `[dbo].[users]` → `Users`: the last part, without quotes. */
function unquote(identifier: string): string {
  const parts = identifier.trim().match(/"(?:[^"]|"")*"|`[^`]*`|\[[^\]]*\]|[^.\s]+/g) ?? [identifier];
  const last = parts[parts.length - 1];
  return /^["`[]/.test(last) ? last.slice(1, -1).replace(/""/g, '"') : last;
}

const key = (identifier: string) => unquote(identifier).toLowerCase();

function stripComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(--|#)[^\n]*/g, (match, _marker, offset: number, all: string) => (isInsideQuotes(all, offset) ? match : ""));
}

function isInsideQuotes(text: string, offset: number): boolean {
  return (text.slice(0, offset).match(/'/g)?.length ?? 0) % 2 === 1;
}

/** Splits on `separator` outside quotes and parentheses. */
function splitTopLevel(text: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quote) {
      if (char === quote) quote = null;
    } else if (char === "'" || char === '"' || char === "`") quote = char;
    else if (char === "(") depth++;
    else if (char === ")") depth--;
    else if (char === separator && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((part) => part.trim()).filter(Boolean);
}

/** The text inside the parentheses that open at `open`. */
function insideParens(text: string, open: number): string | null {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")" && --depth === 0) return text.slice(open + 1, i);
  }
  return null;
}

function nameList(text: string): string[] {
  return splitTopLevel(text, ",").map(unquote);
}

/** Words and parenthesised groups, so `numeric(10, 2)` stays one piece. */
function tokens(text: string): string[] {
  return text.match(/"(?:[^"]|"")*"|`[^`]*`|\[[^\]]*\]|'(?:[^']|'')*'|\([^()]*(?:\([^()]*\)[^()]*)*\)|[^\s(]+/g) ?? [];
}

const REFERENCES = /references\s+((?:"(?:[^"]|"")*"|`[^`]*`|\[[^\]]*\]|[\w$]+)(?:\s*\.\s*(?:"(?:[^"]|"")*"|`[^`]*`|\[[^\]]*\]|[\w$]+))*)\s*(?:\(([^)]*)\))?/i;

function readReference(text: string, columns: string[]): SqlForeignKey | null {
  const match = REFERENCES.exec(text);
  return match ? { columns, table: unquote(match[1]), references: match[2] ? nameList(match[2]) : [] } : null;
}

function readColumn(definition: string, table: SqlTable) {
  const [rawName, ...rest] = tokens(definition);
  const name = unquote(rawName);
  // "character varying" is a type; "character set utf8mb4" (MySQL) is not
  const stop = rest.findIndex((token, index) => COLUMN_CONSTRAINTS.has(token.toLowerCase()) || (/^character$/i.test(token) && /^set$/i.test(rest[index + 1] ?? "")));
  const typeTokens = stop < 0 ? rest : rest.slice(0, stop);
  const constraints = (stop < 0 ? [] : rest.slice(stop)).join(" ");
  const column: SqlTable["columns"][number] = { id: uuid(), name, type: typeTokens.join(" ").replace(/\s+\(/g, "(").toLowerCase() };
  if (/\bprimary\s+key\b/i.test(constraints)) {
    column.isPrimaryKey = true;
    table.uniqueSets.push([name]);
  }
  if (/\bunique\b/i.test(constraints)) table.uniqueSets.push([name]);
  const reference = readReference(constraints, [name]);
  if (reference) table.foreignKeys.push(reference);
  table.columns.push(column);
}

function readTableConstraint(definition: string, table: SqlTable) {
  const body = definition.replace(/^constraint\s+\S+\s+/i, "");
  const listAt = body.indexOf("(");
  const names = listAt >= 0 ? nameList(insideParens(body, listAt) ?? "") : [];
  if (/^primary\s+key/i.test(body)) table.uniqueSets.push(names);
  else if (/^unique/i.test(body)) table.uniqueSets.push(names);
  else if (/^foreign\s+key/i.test(body)) {
    const reference = readReference(body, names);
    if (reference) table.foreignKeys.push(reference);
  }
  if (/^primary\s+key/i.test(body)) for (const column of table.columns) if (names.some((name) => name.toLowerCase() === column.name.toLowerCase())) column.isPrimaryKey = true;
}

const CREATE_TABLE = /^create\s+(?:or\s+replace\s+)?(?:(?:global|local)\s+)?(?:temp(?:orary)?\s+|unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?((?:"(?:[^"]|"")*"|`[^`]*`|\[[^\]]*\]|[\w$]+)(?:\s*\.\s*(?:"(?:[^"]|"")*"|`[^`]*`|\[[^\]]*\]|[\w$]+))*)\s*\(/i;
const ALTER_TABLE = /^alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(\S+)\s+add\s+([\s\S]*)$/i;

function readCreateTable(statement: string): SqlTable | null {
  const match = CREATE_TABLE.exec(statement);
  if (!match) return null;
  const body = insideParens(statement, match[0].length - 1);
  if (body === null) return null;
  const table: SqlTable = { name: unquote(match[1]), columns: [], uniqueSets: [], foreignKeys: [] };
  for (const definition of splitTopLevel(body, ",")) {
    if (/^constraint\s/i.test(definition) || TABLE_CONSTRAINTS.test(definition)) readTableConstraint(definition, table);
    else if (!/^like\s/i.test(definition)) readColumn(definition, table);
  }
  return table;
}

/** `ALTER TABLE … ADD [CONSTRAINT x] PRIMARY KEY / FOREIGN KEY …`, as pg_dump and MySQL Workbench write them. */
function applyAlterTable(statement: string, tables: Map<string, SqlTable>): boolean {
  const match = ALTER_TABLE.exec(statement);
  const table = match && tables.get(key(match[1]));
  if (!match || !table) return false;
  const added = match[2].trim();
  if (!/^(constraint\s+\S+\s+)?(primary\s+key|foreign\s+key|unique)/i.test(added)) return false;
  readTableConstraint(added, table);
  return true;
}

/** "CREATE INDEX", "INSERT INTO"… for the skipped-statements warning. */
function statementKind(statement: string): string {
  const words = statement.split(/\s+/).slice(0, 3).map((word) => word.toUpperCase());
  if (words[0] === "CREATE" && words[1] === "UNIQUE") return "CREATE UNIQUE INDEX";
  return words[0] === "CREATE" || words[0] === "ALTER" || words[0] === "DROP" ? words.slice(0, 2).join(" ") : words[0];
}

/** Statements that only set up the session: skipped without a warning. */
const SESSION_STATEMENT = /^(set|use|begin|commit|start\s+transaction|pragma|select\s+pg_catalog|\\)/i;

export interface ParsedSchema {
  tables: SqlTable[];
  skipped: Map<string, number>;
}

export function parseSchema(sql: string): ParsedSchema {
  const tables = new Map<string, SqlTable>();
  const skipped = new Map<string, number>();
  for (const statement of splitTopLevel(stripComments(sql), ";")) {
    const table = readCreateTable(statement);
    if (table) tables.set(key(table.name), table);
    else if (!applyAlterTable(statement, tables) && !SESSION_STATEMENT.test(statement)) skipped.set(statementKind(statement), (skipped.get(statementKind(statement)) ?? 0) + 1);
  }
  return { tables: [...tables.values()], skipped };
}

function sameNames(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((name) => b.some((other) => other.toLowerCase() === name.toLowerCase()));
}

function findColumn(table: SqlTable, name: string | undefined) {
  return name === undefined ? undefined : table.columns.find((column) => column.name.toLowerCase() === name.toLowerCase());
}

/** Card width from the longest "name type" row. */
function tableWidth(table: SqlTable): number {
  const longest = Math.max(table.name.length, ...table.columns.map((column) => column.name.length + column.type.length + 6));
  return Math.max(MIN_TABLE_WIDTH, Math.round(longest * CHAR_WIDTH + 48));
}

/** Tables in a grid of about √n columns; each grid row is as tall as its tallest table. */
function layoutGrid(tables: SqlTable[]): { x: number; y: number; width: number; height: number }[] {
  const perRow = Math.max(1, Math.ceil(Math.sqrt(tables.length)));
  const sizes = tables.map((table) => ({ width: tableWidth(table), height: tableHeight(table.columns.length) }));
  const columnWidths = Array.from({ length: perRow }, (_, column) => Math.max(0, ...sizes.filter((_, index) => index % perRow === column).map((size) => size.width)));
  let y = MARGIN;
  const boxes: { x: number; y: number; width: number; height: number }[] = [];
  for (let start = 0; start < sizes.length; start += perRow) {
    const row = sizes.slice(start, start + perRow);
    let x = MARGIN;
    row.forEach((size, column) => {
      boxes.push({ x, y, ...size });
      x += columnWidths[column] + GRID_GAP_X;
    });
    y += Math.max(...row.map((size) => size.height)) + GRID_GAP_Y;
  }
  return boxes;
}

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

/** Table cards in a grid, with a relation line from each foreign key row to the row it references. */
export function canvasFromSchema({ tables, skipped }: ParsedSchema, name: string): { diagram: Diagram; warnings: string[] } {
  const byName = new Map(tables.map((table) => [table.name.toLowerCase(), table]));
  const nodeIds = new Map(tables.map((table) => [table, uuid()]));
  const edges: DiagramEdge[] = [];
  const missing = new Set<string>();

  for (const table of tables) {
    for (const foreignKey of table.foreignKeys) {
      const target = byName.get(foreignKey.table.toLowerCase());
      for (const column of foreignKey.columns) {
        const own = findColumn(table, column);
        if (own) own.isForeignKey = true;
      }
      if (!target) {
        missing.add(foreignKey.table);
        continue;
      }
      const fromRow = findColumn(table, foreignKey.columns[0]);
      const toRow = findColumn(target, foreignKey.references[0]) ?? target.columns.find((column) => column.isPrimaryKey);
      const isOneToOne = table.uniqueSets.some((set) => sameNames(set, foreignKey.columns));
      const cardinality: Cardinality = isOneToOne ? "one-to-one" : "many-to-one";
      edges.push({
        id: uuid(),
        from: nodeIds.get(table)!,
        to: nodeIds.get(target)!,
        label: "",
        type: "line",
        cardinality,
        ...(fromRow ? { fromRow: fromRow.id } : {}),
        ...(toRow ? { toRow: toRow.id } : {}),
      });
    }
  }

  const boxes = layoutGrid(tables);
  const nodes: DiagramNode[] = tables.map((table, index) => ({
    id: nodeIds.get(table)!,
    type: "table",
    label: table.name,
    ...boxes[index],
    data: { columns: table.columns.map(({ id, name: columnName, type, isPrimaryKey, isForeignKey }) => ({ id, name: columnName, type, ...(isPrimaryKey ? { isPrimaryKey } : {}), ...(isForeignKey ? { isForeignKey } : {}) })) },
  }));

  const warnings = [];
  if (missing.size) warnings.push(`Foreign keys to tables that aren't in the file have no line: ${[...missing].join(", ")}`);
  if (skipped.size) {
    const total = [...skipped.values()].reduce((sum, count) => sum + count, 0);
    warnings.push(`Skipped ${plural(total, "statement", "statements")} that ${total === 1 ? "isn't a table" : "aren't tables"}: ${[...skipped].map(([kind, count]) => (count > 1 ? `${kind} (${count})` : kind)).join(", ")}`);
  }
  const now = new Date().toISOString();
  return { diagram: { id: uuid(), projectId: "", name, nodes, edges, tags: [], createdAt: now, updatedAt: now }, warnings };
}

/** `CREATE TABLE` statements (Postgres, MySQL, SQLite) as a new canvas of ERD table cards. */
export const sqlDdlImporter: Importer<Diagram> = {
  id: "canvas-sql",
  label: "SQL schema (.sql)",
  description: "CREATE TABLE statements as database tables with relations",
  accept: [".sql", "application/sql", "text/x-sql"],
  async parse(file) {
    const schema = parseSchema(await file.text());
    if (!schema.tables.length) throw new ImportError(`"${file.name}" has no CREATE TABLE statements.`);
    const { diagram, warnings } = canvasFromSchema(schema, file.name.replace(/\.sql$/i, "") || "Database schema");
    return { items: [diagram], warnings };
  },
};
