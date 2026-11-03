import { v4 as uuid } from "uuid";

export interface ReidentifyOptions {
  /** Extra keys whose string (or string array) values point at an `id`, besides `*Id` / `*Ids` (e.g. Canvas `from`, `to`). */
  refKeys?: string[];
}

type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject => typeof value === "object" && value !== null && !Array.isArray(value);

/** `{ type, id, elementId? }` points at a project asset; its `id` is a reference, never an id the file defines. */
function isAssetRef(value: JsonObject): boolean {
  return typeof value.type === "string" && Object.keys(value).every((key) => key === "type" || key === "id" || key === "elementId");
}

function collectIds(value: unknown, ids: Map<string, string>): void {
  if (Array.isArray(value)) return value.forEach((entry) => collectIds(entry, ids));
  if (!isObject(value)) return;
  if (typeof value.id === "string" && !isAssetRef(value) && !ids.has(value.id)) ids.set(value.id, uuid());
  for (const entry of Object.values(value)) collectIds(entry, ids);
}

function remap(value: unknown, ids: Map<string, string>, isRefKey: (key: string) => boolean): unknown {
  if (Array.isArray(value)) return value.map((entry) => remap(entry, ids, isRefKey));
  if (!isObject(value)) return value;
  const copy: JsonObject = {};
  for (const [key, entry] of Object.entries(value)) {
    if (key === "id" || isRefKey(key)) copy[key] = remapRef(entry, ids);
    else copy[key] = remap(entry, ids, isRefKey);
  }
  return copy;
}

function remapRef(value: unknown, ids: Map<string, string>): unknown {
  if (typeof value === "string") return ids.get(value) ?? value;
  if (Array.isArray(value) && value.every((entry) => typeof entry === "string")) return value.map((entry) => ids.get(entry) ?? entry);
  return value;
}

/**
 * Gives every object in `items` that has an `id` a fresh one, and rewrites references to those ids so the copy stays
 * wired up: `id`, keys ending in `Id` / `Ids`, and `refKeys`. References to things outside `items` (other assets,
 * sprites) are left alone. Returns the copies and the old → new id map.
 */
export function reidentify<T>(items: T[], { refKeys = [] }: ReidentifyOptions = {}): { items: T[]; ids: Map<string, string> } {
  const ids = new Map<string, string>();
  collectIds(items, ids);
  const isRefKey = (key: string) => key.endsWith("Id") || key.endsWith("Ids") || refKeys.includes(key);
  return { items: remap(items, ids, isRefKey) as T[], ids };
}
