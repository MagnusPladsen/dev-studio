/** Quotes a CSV cell and defuses leading = + - @ so spreadsheets don't run it as a formula. */
export function csvCell(value: unknown): string {
  const text = String(value ?? "");
  const safe = /^[=+\-@]/.test(text) ? "'" + text : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** Byte order mark so Excel reads the CSV as UTF-8. */
export const CSV_BOM = "\uFEFF";
