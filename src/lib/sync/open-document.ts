import { isEqual, mergeBodies } from "./merge";

type Body = { id: string };
export type MergeFn<T> = (base: T | undefined, mine: T, theirs: T) => T;

/** `mergeBodies` for a typed document (a note, a decision…). */
export const mergeDocuments = <T extends Body>(base: T | undefined, mine: T, theirs: T): T =>
  mergeBodies(base as Record<string, unknown> | undefined, mine as unknown as Record<string, unknown>, theirs as unknown as Record<string, unknown>) as unknown as T;

/**
 * What an editor does with its open document when a version from another tab, device or the MCP
 * server lands in storage. `base` is the stored version the editor last loaded or saved, `mine` what
 * is on screen, `stored` the new version.
 * - No local edits: show the stored version as it is (`replace`).
 * - Local edits: merge both sides on top of `base` (`merge`), so neither side's change is lost.
 */
export function followRemoteChange<T extends Body>(
  base: T | null | undefined,
  mine: T,
  stored: T,
  hasLocalEdits: boolean,
  merge: MergeFn<T> = mergeDocuments
): { kind: "unchanged" | "replace" | "merge"; next: T } {
  if (stored === mine || stored === base) return { kind: "unchanged", next: mine };
  if (!hasLocalEdits) return { kind: "replace", next: stored };
  return { kind: "merge", next: merge(base ?? undefined, mine, stored) };
}

/**
 * The version an editor should write: its own, with any change that reached storage since `base`
 * merged in (or `mine` itself when nothing new came in). Without this, a save based on an older copy
 * would overwrite that change. With no known `base` there is nothing to merge against, and the
 * editor's version is written as it is.
 */
export function rebaseOnStored<T extends Body>(
  base: T | null | undefined,
  mine: T,
  stored: T | undefined,
  merge: MergeFn<T> = mergeDocuments
): T {
  if (!stored || !base || stored === base || stored === mine) return mine;
  const merged = merge(base, mine, stored);
  return isEqual(withoutStamp(merged), withoutStamp(mine)) ? mine : merged;
}

/** A body without its `updatedAt`, which every save sets anew and so says nothing about content. */
function withoutStamp(body: Body): Record<string, unknown> {
  const rest: Record<string, unknown> = { ...body };
  delete rest.updatedAt;
  return rest;
}
