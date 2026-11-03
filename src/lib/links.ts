import { v4 as uuid } from "uuid";
import type { AssetLink, AssetRef, AssetRelation, AssetType, Diagram, StoryEntry } from "@/types";
import { storage } from "./storage";
import { ASSET_KINDS, getAsset, type AssetSummary } from "./assets";
import { elementName, findElement } from "./diagrams/elements";

export type LinkSource = "link" | "story" | "wiki";

export interface RelatedAsset extends AssetSummary {
  source: LinkSource;
  /** Set when the other end is one element on a canvas: that element and its name. */
  elementId?: string;
  elementName?: string;
  /** Set when the link starts at one of this canvas's own elements (a canvas as a whole lists those too). */
  viaElementId?: string;
  viaElementName?: string;
}

const WIKI_LINK = /\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g;

export function wikiTargets(content: string): string[] {
  return [...content.matchAll(WIKI_LINK)].map((m) => m[1].trim().toLowerCase());
}

/** Keeps the story links whose target still exists, e.g. after undo brings back a link to a deleted asset. */
export function dropDeletedLinkTargets(projectId: string, links: AssetLink[]): { links: AssetLink[]; dropped: number } {
  const kept = links.filter((link) => storage.getById(ASSET_KINDS[link.targetType].collection, link.targetId, projectId));
  return { links: kept, dropped: links.length - kept.length };
}

/** A ref's identity: two refs to one canvas differ when they point at different elements, or one at all of it. */
export function refKey(ref: AssetRef): string {
  return ref.elementId ? `${ref.type}:${ref.id}#${ref.elementId}` : `${ref.type}:${ref.id}`;
}

/** The key a related item is listed under, so one asset reached through two of a canvas's elements shows twice. */
export function relatedKey(related: RelatedAsset): string {
  const key = refKey({ type: related.type, id: related.id, elementId: related.elementId });
  return related.viaElementId ? `${related.viaElementId}>${key}` : key;
}

/** The ref a related item points at (an element of a canvas, or a whole asset). */
export function relatedRef(related: RelatedAsset): AssetRef {
  return related.elementId ? { type: related.type, id: related.id, elementId: related.elementId } : { type: related.type, id: related.id };
}

export function relatedLabel(related: RelatedAsset): string {
  return related.elementName ? `${related.name} › ${related.elementName}` : related.name;
}

function isSameEnd(a: AssetRef, b: AssetRef): boolean {
  return a.id === b.id && (a.elementId ?? "") === (b.elementId ?? "");
}

function isSameLink(link: AssetRelation, a: AssetRef, b: AssetRef): boolean {
  return (isSameEnd(link.from, a) && isSameEnd(link.to, b)) || (isSameEnd(link.from, b) && isSameEnd(link.to, a));
}

/** Both directions of a link, as [this end, other end]. */
function endsOf(link: AssetRelation): [AssetRef, AssetRef][] {
  return [
    [link.from, link.to],
    [link.to, link.from],
  ];
}

/** The name of the element a ref points at; null when it points at a whole asset, undefined when the element is gone. */
function elementNameOf(projectId: string, ref: AssetRef, pending?: Diagram | null): string | null | undefined {
  if (!ref.elementId) return null;
  const node = findElement(projectId, ref.id, ref.elementId, pending);
  return node ? elementName(node) : undefined;
}

function refExists(projectId: string, ref: AssetRef, pending?: Diagram | null): boolean {
  const isStored = pending?.id === ref.id || Boolean(storage.getById(ASSET_KINDS[ref.type].collection, ref.id, projectId));
  return isStored && elementNameOf(projectId, ref, pending) !== undefined;
}

/** How a ref reads in lists and toasts: "Data model › users" for an element, the asset's name otherwise. */
export function refLabel(projectId: string, ref: AssetRef): string | undefined {
  const name = getAsset(projectId, ref.type, ref.id)?.name;
  const element = elementNameOf(projectId, ref);
  if (!name || element === undefined) return undefined;
  return element ? `${name} › ${element}` : name;
}

function describeEnd(projectId: string, ref: AssetRef, source: LinkSource): RelatedAsset | undefined {
  const summary = getAsset(projectId, ref.type, ref.id);
  const element = elementNameOf(projectId, ref);
  if (!summary || element === undefined) return undefined;
  return element ? { ...summary, source, elementId: ref.elementId, elementName: element } : { ...summary, source };
}

function addStoryRelations(projectId: string, type: AssetType, id: string, add: (ref: AssetRef, source: LinkSource) => void) {
  for (const entry of storage.getAll("stories", projectId)) {
    if (type === "story" && entry.id === id) {
      for (const l of entry.links ?? []) add({ type: l.targetType, id: l.targetId }, "story");
    } else if ((entry.links ?? []).some((l) => l.targetId === id)) {
      add({ type: "story", id: entry.id }, "story");
    }
  }
}

function addWikiRelations(projectId: string, id: string, add: (ref: AssetRef, source: LinkSource) => void) {
  const stories = storage.getAll("stories", projectId);
  const self = stories.find((s) => s.id === id);
  if (!self) return;
  const byTitle = new Map(stories.map((s) => [s.title.trim().toLowerCase(), s]));
  for (const t of wikiTargets(self.content)) {
    const target = byTitle.get(t);
    if (target) add({ type: "story", id: target.id }, "wiki");
  }
  const selfTitle = self.title.trim().toLowerCase();
  for (const s of stories) if (wikiTargets(s.content).includes(selfTitle)) add({ type: "story", id: s.id }, "wiki");
}

/**
 * Everything connected to an asset, in either direction: explicit links, story entries' asset links, and
 * [[wiki links]] between story entries. With `elementId`, only the explicit links of that one canvas element.
 * A canvas as a whole also lists its elements' links, each marked with the element it starts at.
 */
export function getRelated(projectId: string, type: AssetType, id: string, elementId?: string): RelatedAsset[] {
  const found = new Map<string, RelatedAsset>();
  const add = (ref: AssetRef, source: LinkSource, via?: AssetRef) => {
    if (ref.id === id) return;
    const related = describeEnd(projectId, ref, source);
    const viaName = via ? elementNameOf(projectId, via) : null;
    if (!related || viaName === undefined) return;
    const entry = viaName ? { ...related, viaElementId: via?.elementId, viaElementName: viaName } : related;
    if (!found.has(relatedKey(entry))) found.set(relatedKey(entry), entry);
  };

  for (const link of storage.getAll("links", projectId)) {
    for (const [mine, other] of endsOf(link)) {
      if (mine.id !== id) continue;
      if (!elementId) add(other, "link", mine.elementId ? mine : undefined);
      else if (mine.elementId === elementId) add(other, "link");
    }
  }
  if (elementId) return [...found.values()];
  addStoryRelations(projectId, type, id, add);
  if (type === "story") addWikiRelations(projectId, id, add);
  return [...found.values()];
}

/** The explicit links of one canvas element. */
export function getElementLinks(projectId: string, diagramId: string, elementId: string): RelatedAsset[] {
  return getRelated(projectId, "diagram", diagramId, elementId);
}

/** How many things each element of `diagram` links to, for the badges on the board (elements without links are left out). */
export function countElementLinks(projectId: string, diagram: Diagram): Map<string, number> {
  const elementIds = new Set(diagram.nodes.map((node) => node.id));
  const seen = new Map<string, Set<string>>();
  for (const link of storage.getAll("links", projectId)) {
    for (const [mine, other] of endsOf(link)) {
      if (mine.id !== diagram.id || !mine.elementId || !elementIds.has(mine.elementId) || other.id === diagram.id) continue;
      if (!refExists(projectId, other)) continue;
      seen.set(mine.elementId, (seen.get(mine.elementId) ?? new Set<string>()).add(refKey(other)));
    }
  }
  return new Map([...seen].map(([elementId, keys]) => [elementId, keys.size]));
}

export interface RelatedCount {
  notes: number;
  others: number;
}

/**
 * What `getRelated` would count for each of `ids` (all of one non-story type), in one pass over
 * the links and story entries instead of one pass per asset.
 */
export function countRelated(projectId: string, ids: string[]): Map<string, RelatedCount> {
  const wanted = new Set(ids);
  const seen = new Map<string, Set<string>>();
  const counts = new Map<string, RelatedCount>(ids.map((id) => [id, { notes: 0, others: 0 }]));
  const add = (mine: AssetRef, ref: AssetRef) => {
    const keys = seen.get(mine.id) ?? new Set<string>();
    seen.set(mine.id, keys);
    const key = mine.elementId ? `${mine.elementId}>${refKey(ref)}` : refKey(ref);
    if (ref.id === mine.id || keys.has(key) || !refExists(projectId, ref) || !refExists(projectId, mine)) return;
    keys.add(key);
    const count = counts.get(mine.id)!;
    if (ref.type === "note") count.notes++;
    else count.others++;
  };

  for (const link of storage.getAll("links", projectId)) {
    for (const [mine, other] of endsOf(link)) if (wanted.has(mine.id)) add(mine, other);
  }
  for (const entry of storage.getAll("stories", projectId)) {
    for (const l of entry.links ?? []) if (wanted.has(l.targetId)) add({ type: l.targetType, id: l.targetId }, { type: "story", id: entry.id });
  }
  return counts;
}

/** The explicit links that touch each of `ids` (a canvas's element links count as touching the canvas). */
export function linksTouching(projectId: string, ids: string[]): Map<string, AssetRelation[]> {
  const wanted = new Set(ids);
  const found = new Map<string, AssetRelation[]>();
  for (const link of storage.getAll("links", projectId)) {
    for (const end of new Set([link.from.id, link.to.id])) {
      if (wanted.has(end)) found.set(end, [...(found.get(end) ?? []), link]);
    }
  }
  return found;
}

/** The explicit links that touch each of `elementIds` on canvas `diagramId`. */
export function linksTouchingElements(projectId: string, diagramId: string, elementIds: string[]): Map<string, AssetRelation[]> {
  const wanted = new Set(elementIds);
  const found = new Map<string, AssetRelation[]>();
  for (const link of storage.getAll("links", projectId)) {
    const touched = new Set(
      [link.from, link.to].filter((end) => end.id === diagramId && end.elementId && wanted.has(end.elementId)).map((end) => end.elementId!)
    );
    for (const elementId of touched) found.set(elementId, [...(found.get(elementId) ?? []), link]);
  }
  return found;
}

/**
 * Puts back links that were removed along with an asset or element, once both ends exist again.
 * `pending` is a canvas an editor holds but may not have saved yet, so its restored elements count as existing.
 */
export function restoreLinks(projectId: string, links: AssetRelation[], pending?: Diagram | null) {
  const current = new Set(storage.getAll("links", projectId).map((l) => l.id));
  for (const link of links) {
    if (current.has(link.id)) continue;
    if (refExists(projectId, link.from, pending) && refExists(projectId, link.to, pending)) {
      storage.save("links", link, projectId);
      current.add(link.id);
    }
  }
}

/** Removes the links of elements taken off canvas `diagramId`, and returns them so undo can put them back. */
export function removeElementLinks(projectId: string, diagramId: string, elementIds: string[]): AssetRelation[] {
  const removed = [...new Set([...linksTouchingElements(projectId, diagramId, elementIds).values()].flat())];
  for (const link of removed) storage.delete("links", link.id, projectId);
  return removed;
}

function storedEnd(ref: AssetRef): AssetRef {
  return ref.elementId ? { type: ref.type, id: ref.id, elementId: ref.elementId } : { type: ref.type, id: ref.id };
}

export function addLink(projectId: string, from: AssetRef, to: AssetRef) {
  if (isSameEnd(from, to) || storage.getAll("links", projectId).some((l) => isSameLink(l, from, to))) return;
  const now = new Date().toISOString();
  storage.save("links", { id: uuid(), projectId, from: storedEnd(from), to: storedEnd(to), createdAt: now, updatedAt: now }, projectId);
}

export function removeLink(projectId: string, a: AssetRef, b: AssetRef) {
  for (const l of storage.getAll("links", projectId)) {
    if (isSameLink(l, a, b)) storage.delete("links", l.id, projectId);
  }
  if (a.elementId || b.elementId) return;
  for (const [story, other] of [
    [a, b],
    [b, a],
  ] as const) {
    if (story.type !== "story") continue;
    const entry = storage.getById("stories", story.id, projectId) as StoryEntry | undefined;
    if (!entry?.links?.some((l) => l.targetId === other.id)) continue;
    storage.save(
      "stories",
      { ...entry, links: entry.links.filter((l) => l.targetId !== other.id), updatedAt: new Date().toISOString() },
      projectId
    );
  }
}
