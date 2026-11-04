import type { DiagramNode } from "@/types";
import { autoLayout, groupParents, type LayoutOptions } from "@/lib/diagrams/auto-layout";
import { elementName } from "@/lib/diagrams/elements";
import { boundsOf, GROUP_HEADER, GROUP_PADDING, type Rect } from "@/lib/diagrams/geometry";
import { besideRect, rectFor } from "./geometry";
import type { LayoutChoice } from "./op-schema";
import { nodeOf, type Work } from "./work";

function layoutOptions(layout: LayoutChoice): LayoutOptions {
  if (layout === "auto") return {};
  if (layout === "none") return { algorithm: "grid" };
  return { algorithm: layout.algorithm, direction: layout.direction, spacing: layout.spacing };
}

function groupOf(work: Work, handle: string): string {
  const group = nodeOf(work, handle);
  if (group.type !== "group") throw new Error(`"${elementName(group)}" is not a group, so nothing can go in it.`);
  return group.id;
}

function setRect(work: Work, id: string, rect: Rect): void {
  work.diagram.nodes = work.diagram.nodes.map((n) => (n.id === id ? { ...n, x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) } : n));
  work.changed.add(id);
}

/** Group ops whose members are all new and unplaced are laid out as one unit; the rest are drawn around their members. */
function splitGroups(work: Work) {
  const isFree = (id: string) => work.placements.has(id) && !work.placements.get(id)!.near && !work.placements.get(id)!.in;
  const laidOut = work.groups.filter((g) => g.members.every(isFree));
  return { laidOut, wrapped: work.groups.filter((g) => !laidOut.includes(g)) };
}

/** Parents for the layout: what stays keeps the group it sits in now; placed elements get theirs from the ops. */
function layoutParents(work: Work, fixed: DiagramNode[], batch: string[], laidOut: { id: string; members: string[] }[]) {
  const parents: Record<string, string | null> = Object.fromEntries(groupParents(fixed));
  for (const id of batch) {
    const into = work.placements.get(id)?.in;
    parents[id] = into ? groupOf(work, into) : (laidOut.find((g) => g.members.includes(id))?.id ?? null);
  }
  return parents;
}

function layoutBatch(work: Work, layout: LayoutChoice, skip: Set<string>, laidOut: { id: string; members: string[] }[]): void {
  const batch = [...[...work.placements].filter(([, p]) => !p.near).map(([id]) => id), ...laidOut.map((g) => g.id)];
  if (!batch.length) return;
  const nodes = work.diagram.nodes.filter((n) => !skip.has(n.id));
  const fixed = nodes.filter((n) => !batch.includes(n.id));
  const parents = layoutParents(work, fixed, batch, laidOut);
  const origin = fixed.length ? undefined : { x: 0, y: 0 };
  const rects = autoLayout(nodes, work.diagram.edges, { ...layoutOptions(layout), place: batch, parents, origin });
  for (const [id, rect] of rects) setRect(work, id, rect);
}

function contains(outer: Rect, inner: Rect): boolean {
  return outer.x <= inner.x && outer.y <= inner.y && outer.x + outer.width >= inner.x + inner.width && outer.y + outer.height >= inner.y + inner.height;
}

function placeNear(work: Work, ids: string[], unplaced: Set<string>): void {
  for (const id of ids) {
    const request = work.placements.get(id)!;
    const target = nodeOf(work, request.near!);
    if (target.id === id) throw new Error(`"${request.near}" can't be placed near itself.`);
    const targetRect = rectFor(target);
    const node = work.diagram.nodes.find((n) => n.id === id)!;
    const taken = work.diagram.nodes.filter((n) => n.id !== id && !unplaced.has(n.id)).map(rectFor).filter((r) => !contains(r, targetRect));
    const at = besideRect(targetRect, rectFor(node), request.side ?? "right", [...taken, targetRect]);
    setRect(work, id, { ...rectFor(node), ...at });
    unplaced.delete(id);
  }
}

function wrapGroups(work: Work, groups: { id: string; members: string[] }[]): void {
  for (const group of groups) {
    const bounds = boundsOf(work.diagram.nodes.filter((n) => group.members.includes(n.id)).map(rectFor));
    if (!bounds) continue;
    const padded = { x: bounds.x - GROUP_PADDING, y: bounds.y - GROUP_PADDING - GROUP_HEADER, width: bounds.width + GROUP_PADDING * 2, height: bounds.height + GROUP_PADDING * 2 + GROUP_HEADER };
    setRect(work, group.id, padded);
  }
}

/**
 * Puts every element the ops left without a position: one auto-layout block (new group members inside their group,
 * `in` members in theirs), then `near` elements beside their targets, then groups around members that were already
 * placed. Only those elements move; everything else stays where it is.
 */
export function placeElements(work: Work, layout: LayoutChoice = "auto"): void {
  const nearIds = [...work.placements].filter(([, p]) => p.near).map(([id]) => id);
  const { laidOut, wrapped } = splitGroups(work);
  const unplaced = new Set([...nearIds, ...wrapped.map((g) => g.id)]);
  layoutBatch(work, layout, unplaced, laidOut);
  placeNear(work, nearIds, unplaced);
  wrapGroups(work, wrapped);
}
