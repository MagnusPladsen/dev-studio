import { v4 as uuid } from "uuid";
import type { AssetLink, AssetRef, AssetRelation, AssetType, StoryEntry } from "@/types";
import { storage } from "./storage";
import { ASSET_KINDS, getAsset, type AssetSummary } from "./assets";

export type LinkSource = "link" | "story" | "wiki";

export interface RelatedAsset extends AssetSummary {
  source: LinkSource;
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

/**
 * Everything connected to an asset, in either direction:
 * explicit links, story entries' asset links, and [[wiki links]] between story entries.
 */
export function getRelated(projectId: string, type: AssetType, id: string): RelatedAsset[] {
  const found = new Map<string, RelatedAsset>();
  const add = (ref: AssetRef, source: LinkSource) => {
    const key = `${ref.type}:${ref.id}`;
    if (found.has(key) || (ref.type === type && ref.id === id)) return;
    const summary = getAsset(projectId, ref.type, ref.id);
    if (summary) found.set(key, { ...summary, source });
  };

  for (const rel of storage.getAll("links", projectId)) {
    if (rel.from.id === id) add(rel.to, "link");
    else if (rel.to.id === id) add(rel.from, "link");
  }

  const stories = storage.getAll("stories", projectId);
  for (const entry of stories) {
    if (type === "story" && entry.id === id) {
      for (const l of entry.links ?? []) add({ type: l.targetType, id: l.targetId }, "story");
    } else if ((entry.links ?? []).some((l) => l.targetId === id)) {
      add({ type: "story", id: entry.id }, "story");
    }
  }

  if (type === "story") {
    const self = stories.find((s) => s.id === id);
    if (self) {
      const byTitle = new Map(stories.map((s) => [s.title.trim().toLowerCase(), s]));
      for (const t of wikiTargets(self.content)) {
        const target = byTitle.get(t);
        if (target) add({ type: "story", id: target.id }, "wiki");
      }
      const selfTitle = self.title.trim().toLowerCase();
      for (const s of stories) if (wikiTargets(s.content).includes(selfTitle)) add({ type: "story", id: s.id }, "wiki");
    }
  }

  return [...found.values()];
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
  const add = (id: string, ref: AssetRef) => {
    const keys = seen.get(id) ?? new Set<string>();
    seen.set(id, keys);
    const key = `${ref.type}:${ref.id}`;
    if (ref.id === id || keys.has(key) || !getAsset(projectId, ref.type, ref.id)) return;
    keys.add(key);
    const count = counts.get(id)!;
    if (ref.type === "note") count.notes++;
    else count.others++;
  };

  for (const rel of storage.getAll("links", projectId)) {
    if (wanted.has(rel.from.id)) add(rel.from.id, rel.to);
    if (wanted.has(rel.to.id)) add(rel.to.id, rel.from);
  }
  for (const entry of storage.getAll("stories", projectId)) {
    for (const l of entry.links ?? []) if (wanted.has(l.targetId)) add(l.targetId, { type: "story", id: entry.id });
  }
  return counts;
}

/** The explicit links that touch each of `ids`. */
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

/** Puts back links that were removed along with an asset, once both ends exist again. */
export function restoreLinks(projectId: string, links: AssetRelation[]) {
  const current = new Set(storage.getAll("links", projectId).map((l) => l.id));
  for (const link of links) {
    if (current.has(link.id)) continue;
    const ends = [link.from, link.to].every((ref) => storage.getById(ASSET_KINDS[ref.type].collection, ref.id, projectId));
    if (ends) storage.save("links", link, projectId);
  }
}

export function addLink(projectId: string, from: AssetRef, to: AssetRef) {
  const exists = storage
    .getAll("links", projectId)
    .some((l) => (l.from.id === from.id && l.to.id === to.id) || (l.from.id === to.id && l.to.id === from.id));
  if (exists) return;
  const now = new Date().toISOString();
  storage.save("links", { id: uuid(), projectId, from, to, createdAt: now, updatedAt: now }, projectId);
}

export function removeLink(projectId: string, a: AssetRef, b: AssetRef) {
  for (const l of storage.getAll("links", projectId)) {
    if ((l.from.id === a.id && l.to.id === b.id) || (l.from.id === b.id && l.to.id === a.id)) {
      storage.delete("links", l.id, projectId);
    }
  }
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
