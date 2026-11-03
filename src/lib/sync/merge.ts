/**
 * Three-way merge of two edits of one JSON body (an asset or project), used when a compare-and-swap
 * write finds the server already holds a newer version. `base` is the version both edits started from
 * (undefined when unknown: then nothing counts as deleted).
 *
 * - A field only one side changed takes that side's value.
 * - Lists of objects with ids (canvas nodes and lines, checklist items, columns) merge per element:
 *   additions from both sides are kept, an element deleted on either side stays deleted.
 * - Lists of distinct strings or numbers (tags, labels) merge as sets.
 * - Multi-line text merges by line; where both sides changed the same lines, both versions are kept.
 * - Anything else both sides changed: ours (the local edit) wins.
 */
export function mergeBodies<T extends Record<string, unknown>>(base: T | undefined, mine: T, theirs: T): T {
  return mergeObjects(base, mine, theirs) as T;
}

type Json = unknown;
type Entity = { id: string; [key: string]: Json };

function mergeValue(base: Json, mine: Json, theirs: Json): Json {
  if (isEqual(mine, theirs)) return mine;
  if (isEqual(mine, base)) return theirs;
  if (isEqual(theirs, base)) return mine;
  if (isEntityList(mine) && isEntityList(theirs)) return mergeEntityLists(isEntityList(base) ? base : [], mine, theirs);
  if (isDistinctPrimitiveList(mine) && isDistinctPrimitiveList(theirs)) {
    return mergeSets(isDistinctPrimitiveList(base) ? base : [], mine, theirs);
  }
  if (isPlainObject(mine) && isPlainObject(theirs)) return mergeObjects(isPlainObject(base) ? base : undefined, mine, theirs);
  if (typeof mine === "string" && typeof theirs === "string" && typeof base === "string" && isMultiline(mine, theirs)) {
    return mergeText(base, mine, theirs);
  }
  return mine;
}

function mergeObjects(base: Record<string, Json> | undefined, mine: Record<string, Json>, theirs: Record<string, Json>) {
  const merged: Record<string, Json> = {};
  for (const key of new Set([...Object.keys(mine), ...Object.keys(theirs)])) {
    const value = mergeValue(base?.[key], mine[key], theirs[key]);
    if (value !== undefined) merged[key] = value;
  }
  return merged;
}

function mergeEntityLists(base: Entity[], mine: Entity[], theirs: Entity[]): Entity[] {
  const baseById = new Map(base.map((e) => [e.id, e]));
  const theirsById = new Map(theirs.map((e) => [e.id, e]));
  const mineIds = new Set(mine.map((e) => e.id));
  const merged: Entity[] = [];
  for (const element of mine) {
    const theirElement = theirsById.get(element.id);
    if (theirElement) merged.push(mergeValue(baseById.get(element.id), element, theirElement) as Entity);
    else if (!baseById.has(element.id)) merged.push(element);
  }
  theirs.forEach((element, index) => {
    if (mineIds.has(element.id) || baseById.has(element.id)) return;
    const before = theirs.slice(0, index).reverse().find((e) => merged.some((m) => m.id === e.id));
    merged.splice(before ? merged.findIndex((m) => m.id === before.id) + 1 : 0, 0, element);
  });
  return merged;
}

function mergeSets<V>(base: V[], mine: V[], theirs: V[]): V[] {
  const removedByThem = base.filter((v) => !theirs.includes(v));
  const addedByThem = theirs.filter((v) => !base.includes(v) && !mine.includes(v));
  return [...mine.filter((v) => !removedByThem.includes(v)), ...addedByThem];
}

/** Line-based three-way text merge (diff3 without conflict markers). */
export function mergeText(base: string, mine: string, theirs: string): string {
  const b = base.split("\n");
  const m = mine.split("\n");
  const t = theirs.split("\n");
  const toMine = matchLines(b, m);
  const toTheirs = matchLines(b, t);
  if (!toMine || !toTheirs) return mine;
  const out: string[] = [];
  let [bi, mi, ti] = [0, 0, 0];
  for (let i = 0; i < b.length; i++) {
    const mIndex = toMine.get(i);
    const tIndex = toTheirs.get(i);
    if (mIndex === undefined || tIndex === undefined) continue;
    out.push(...mergeChunk(b.slice(bi, i), m.slice(mi, mIndex), t.slice(ti, tIndex)), b[i]);
    [bi, mi, ti] = [i + 1, mIndex + 1, tIndex + 1];
  }
  out.push(...mergeChunk(b.slice(bi), m.slice(mi), t.slice(ti)));
  return out.join("\n");
}

function mergeChunk(base: string[], mine: string[], theirs: string[]): string[] {
  if (isEqual(mine, base)) return theirs;
  if (isEqual(theirs, base) || isEqual(mine, theirs)) return mine;
  return [...mine, ...theirs];
}

const MAX_DIFF_CELLS = 4_000_000;

/** Longest-common-subsequence line matching: base line index → other line index. Null when too large. */
function matchLines(base: string[], other: string[]): Map<number, number> | null {
  const matches = new Map<number, number>();
  let start = 0;
  while (start < base.length && start < other.length && base[start] === other[start]) matches.set(start, start++);
  let endB = base.length;
  let endO = other.length;
  while (endB > start && endO > start && base[endB - 1] === other[endO - 1]) matches.set(--endB, --endO);
  const rows = endB - start;
  const cols = endO - start;
  if (rows * cols > MAX_DIFF_CELLS) return null;
  const lengths = Array.from({ length: rows + 1 }, () => new Uint32Array(cols + 1));
  for (let i = rows - 1; i >= 0; i--) {
    for (let j = cols - 1; j >= 0; j--) {
      lengths[i][j] =
        base[start + i] === other[start + j] ? lengths[i + 1][j + 1] + 1 : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
    }
  }
  for (let i = 0, j = 0; i < rows && j < cols; ) {
    if (base[start + i] === other[start + j]) matches.set(start + i++, start + j++);
    else if (lengths[i + 1][j] >= lengths[i][j + 1]) i++;
    else j++;
  }
  return matches;
}

function isMultiline(...texts: string[]): boolean {
  return texts.some((text) => text.includes("\n"));
}

function isPlainObject(value: Json): value is Record<string, Json> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isEntityList(value: Json): value is Entity[] {
  return Array.isArray(value) && value.every((e) => isPlainObject(e) && typeof e.id === "string");
}

function isDistinctPrimitiveList(value: Json): value is (string | number)[] {
  return (
    Array.isArray(value) &&
    value.every((v) => typeof v === "string" || typeof v === "number") &&
    new Set(value).size === value.length
  );
}

export function isEqual(a: Json, b: Json): boolean {
  if (a === b) return true;
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((v, i) => isEqual(v, b[i]));
  if (!isPlainObject(a) || !isPlainObject(b)) return false;
  const keys = Object.keys(a).filter((k) => a[k] !== undefined);
  return keys.length === Object.keys(b).filter((k) => b[k] !== undefined).length && keys.every((k) => isEqual(a[k], b[k]));
}
