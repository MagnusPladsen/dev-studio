/**
 * Issue keys and ADR numbers are unique per project in the database. When a save is refused because
 * another writer (a second tab, the MCP server) took the same one first, ours moves to the next free one.
 */

/** "TIDE-4" with TIDE-1…TIDE-30 taken → "TIDE-31". A key without a number gets one: "TIDE" → "TIDE-1". */
export function nextFreeIssueKey(key: string, taken: string[]): string {
  const prefix = key.match(/^(.*)-\d+$/)?.[1] ?? key;
  let highest = 0;
  for (const other of taken) {
    if (!other.startsWith(`${prefix}-`)) continue;
    const number = other.slice(prefix.length + 1);
    if (/^\d+$/.test(number)) highest = Math.max(highest, Number(number));
  }
  return `${prefix}-${highest + 1}`;
}

export function nextFreeNumber(taken: unknown[]): number {
  return Math.max(0, ...taken.map(Number).filter(Number.isFinite)) + 1;
}
