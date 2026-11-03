import type { CsvSource } from "./types";

function delimiterOf(firstLine: string): string {
  const counts = [",", ";", "\t"].map((delimiter) => [delimiter, firstLine.split(delimiter).length] as const);
  return counts.reduce((best, next) => (next[1] > best[1] ? next : best))[0];
}

/** Undoes the board export's formula guard: a leading `'` before = + - @. */
function unguard(cell: string): string {
  return /^'[=+\-@]/.test(cell) ? cell.slice(1) : cell;
}

/** Reads CSV text (quoted cells, line breaks inside quotes, `,` `;` or tab between cells) into rows of cells. */
export function parseCsvRows(text: string): string[][] {
  const source = text.replace(/^﻿/, "");
  const delimiter = delimiterOf(source.slice(0, source.search(/\r?\n|$/)));
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let isQuoted = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (isQuoted) {
      if (char === '"' && source[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') isQuoted = false;
      else cell += char;
    } else if (char === '"' && cell === "") isQuoted = true;
    else if (char === delimiter) {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  if (cell !== "" || row.length) rows.push([...row, cell]);
  return rows.filter((cells) => cells.some((value) => value.trim() !== "")).map((cells) => cells.map(unguard));
}

/** The first row is the header; every other row is padded to its width. */
export function parseCsvTable(text: string): CsvSource {
  const [headers = [], ...rows] = parseCsvRows(text);
  const trimmed = headers.map((header) => header.trim());
  return { headers: trimmed, rows: rows.map((cells) => trimmed.map((_, index) => cells[index] ?? "")) };
}
