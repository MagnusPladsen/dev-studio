import type { DiagramEdge, DiagramNode } from "@/types";
import { boundsOf, centerOf, containsPoint, GROUP_HEADER, GROUP_PADDING, MIN_GROUP_WIDTH, type Point, type Rect } from "./geometry";
import { tableColumns, tableHeight } from "./tables";

// Places Canvas elements without anyone computing coordinates: the MCP server lays out what Claude adds, and
// the board's "Auto-arrange" tidies a whole canvas. Pure and deterministic: the same input gives the same
// output, so the app and the server agree. A group lays out its members first and then moves as one block.

export type LayoutAlgorithm = "grid" | "flow" | "tree" | "erd";
export type LayoutDirection = "right" | "down";

export interface LayoutOptions {
  /** "auto" (the default) picks one from the shape of the elements, see `pickAlgorithm`. */
  algorithm?: LayoutAlgorithm | "auto";
  /** Which way lines point: flow and erd default to "right", tree to "down". */
  direction?: LayoutDirection;
  /** Gap between neighbouring elements; 40, or 80 for erd. */
  spacing?: number;
  /** Ids to place; every other element stays exactly where it is. Default: all. A placed group brings its members. */
  place?: string[];
  /** Top-left corner for the placed block. Ignored when the block would cover an element that stays put. */
  origin?: Point;
  /** Group of an element by id (null = none), overriding the group its centre lies in. For new elements. */
  parents?: Record<string, string | null>;
}

interface Box {
  id: string;
  width: number;
  height: number;
}

interface Link {
  from: string;
  to: string;
}

interface Settings {
  direction: LayoutDirection;
  gap: number;
  layerGap: number;
}

type Placer = (boxes: Box[], links: Link[], settings: Settings) => Map<string, Point>;

interface Block {
  rects: Map<string, Rect>;
  width: number;
  height: number;
}

interface Context {
  byId: Map<string, DiagramNode>;
  children: Map<string | null, string[]>;
  parents: Map<string, string | null>;
  links: Link[];
  placer: Placer;
  settings: Settings;
}

const DEFAULT_GAP = 40;
const ERD_GAP = 80;
const SWEEPS = 2;

/** The size an element takes up: a table is as tall as its rows. */
function sizeOf(node: DiagramNode): { width: number; height: number } {
  return node.type === "table" ? { width: node.width, height: tableHeight(tableColumns(node).length) } : { width: node.width, height: node.height };
}

function rectOf(node: DiagramNode): Rect {
  return { x: node.x, y: node.y, ...sizeOf(node) };
}

function area(rect: Rect): number {
  return rect.width * rect.height;
}

function overlaps(a: Rect, b: Rect, margin = 0): boolean {
  return a.x < b.x + b.width + margin && b.x < a.x + a.width + margin && a.y < b.y + b.height + margin && b.y < a.y + a.height + margin;
}

/** The smallest group the node's centre lies in: groups have no member list, membership is where things sit. */
function spatialParent(node: DiagramNode, groups: DiagramNode[]): string | null {
  const own = rectOf(node);
  const holders = groups.filter((group) => group.id !== node.id && area(rectOf(group)) > area(own) && containsPoint(rectOf(group), centerOf(own)));
  holders.sort((a, b) => area(rectOf(a)) - area(rectOf(b)));
  return holders[0]?.id ?? null;
}

function hasCycle(id: string, parents: Map<string, string | null>): boolean {
  const seen = new Set<string>();
  for (let at: string | null | undefined = id; at; at = parents.get(at)) {
    if (seen.has(at)) return true;
    seen.add(at);
  }
  return false;
}

/** Each element's group, from `overrides` when given there, else from where it sits. */
export function groupParents(nodes: DiagramNode[], overrides: Record<string, string | null> = {}): Map<string, string | null> {
  const groups = nodes.filter((node) => node.type === "group");
  const groupIds = new Set(groups.map((group) => group.id));
  const parents = new Map<string, string | null>();
  for (const node of nodes) {
    const override = overrides[node.id];
    const isValid = override === null || (override !== undefined && override !== node.id && groupIds.has(override));
    parents.set(node.id, isValid ? override : spatialParent(node, groups));
  }
  for (const node of nodes) if (hasCycle(node.id, parents)) parents.set(node.id, null);
  return parents;
}

function childrenOf(nodes: DiagramNode[], parents: Map<string, string | null>): Map<string | null, string[]> {
  const children = new Map<string | null, string[]>();
  for (const node of nodes) {
    const parent = parents.get(node.id) ?? null;
    children.set(parent, [...(children.get(parent) ?? []), node.id]);
  }
  return children;
}

/** Which table a relation line points away from: the "many" end (or the FK row) refers to the "one" end. */
function relationLink(edge: DiagramEdge, byId: Map<string, DiagramNode>): Link {
  const referencing = (end: "from" | "to") => (end === "from" ? { from: edge.to, to: edge.from } : { from: edge.from, to: edge.to });
  if (edge.cardinality === "many-to-one") return referencing("from");
  if (edge.cardinality === "one-to-many") return referencing("to");
  const isForeignKey = (nodeId: string, rowId?: string) => tableColumns(byId.get(nodeId)!).some((column) => column.id === rowId && column.isForeignKey);
  if (!isForeignKey(edge.from, edge.fromRow) && isForeignKey(edge.to, edge.toRow)) return referencing("to");
  return referencing("from");
}

// --- Placers: positions for one level of boxes, anywhere on the plane; the caller moves the block. ---

const placeGrid: Placer = (boxes, _links, { gap }) => {
  const columns = Math.ceil(Math.sqrt(boxes.length));
  const widths = new Array<number>(columns).fill(0);
  const heights = new Array<number>(Math.ceil(boxes.length / columns)).fill(0);
  boxes.forEach((box, index) => {
    widths[index % columns] = Math.max(widths[index % columns], box.width);
    heights[Math.floor(index / columns)] = Math.max(heights[Math.floor(index / columns)], box.height);
  });
  const offset = (sizes: number[], upTo: number) => sizes.slice(0, upTo).reduce((sum, size) => sum + size + gap, 0);
  return new Map(boxes.map((box, index) => [box.id, { x: offset(widths, index % columns), y: offset(heights, Math.floor(index / columns)) }]));
};

/** The links left after dropping the ones that close a cycle (found depth first, in input order). */
function acyclicLinks(ids: string[], links: Link[]): Link[] {
  const state = new Map<string, "open" | "done">();
  const kept: Link[] = [];
  const visit = (id: string) => {
    state.set(id, "open");
    for (const link of links.filter((l) => l.from === id)) {
      if (state.get(link.to) === "open") continue;
      kept.push(link);
      if (!state.has(link.to)) visit(link.to);
    }
    state.set(id, "done");
  };
  for (const id of ids) if (!state.has(id)) visit(id);
  return kept;
}

/** Longest-path layering: every element sits one layer after the furthest element pointing at it. */
function layersOf(ids: string[], links: Link[]): string[][] {
  const layer = new Map(ids.map((id) => [id, 0]));
  for (let changed = true; changed; ) {
    changed = false;
    for (const link of links) {
      if (layer.get(link.to)! > layer.get(link.from)!) continue;
      layer.set(link.to, layer.get(link.from)! + 1);
      changed = true;
    }
  }
  const layers: string[][] = [];
  for (const id of ids) (layers[layer.get(id)!] ??= []).push(id);
  return layers.filter(Boolean);
}

/** Barycentre ordering: sorts each layer by the mean position of its neighbours in the layer before it. */
function orderLayers(layers: string[][], links: Link[]): string[][] {
  const ordered = layers.map((layer) => [...layer]);
  const sweep = (from: number, to: number, step: number, neighbour: (link: Link, id: string) => string | undefined) => {
    for (let index = from; index !== to; index += step) {
      const previous = ordered[index - step];
      const key = (id: string, at: number) => {
        const spots = links.map((link) => neighbour(link, id)).filter((n) => n !== undefined && previous.includes(n)).map((n) => previous.indexOf(n!));
        return spots.length ? spots.reduce((sum, spot) => sum + spot, 0) / spots.length : at;
      };
      const keyed = ordered[index].map((id, at) => ({ id, at, key: key(id, at) }));
      ordered[index] = keyed.sort((a, b) => a.key - b.key || a.at - b.at).map((entry) => entry.id);
    }
  };
  for (let round = 0; round < SWEEPS; round++) {
    sweep(1, ordered.length, 1, (link, id) => (link.to === id ? link.from : undefined));
    sweep(ordered.length - 2, -1, -1, (link, id) => (link.from === id ? link.to : undefined));
  }
  return ordered;
}

/** Lays out rows of boxes: each layer a column (right) or a row (down), centred on the longest one. */
function placeLayers(layers: Box[][], { direction, gap, layerGap }: Settings): Map<string, Point> {
  const isRight = direction === "right";
  const main = (box: Box) => (isRight ? box.width : box.height);
  const cross = (box: Box) => (isRight ? box.height : box.width);
  const spans = layers.map((layer) => layer.reduce((sum, box) => sum + cross(box), 0) + gap * (layer.length - 1));
  const longest = Math.max(...spans);
  const positions = new Map<string, Point>();
  let along = 0;
  layers.forEach((layer, index) => {
    let across = (longest - spans[index]) / 2;
    for (const box of layer) {
      positions.set(box.id, isRight ? { x: along, y: across } : { x: across, y: along });
      across += cross(box) + gap;
    }
    along += Math.max(...layer.map(main)) + layerGap;
  });
  return positions;
}

const placeFlow: Placer = (boxes, links, settings) => {
  const ids = boxes.map((box) => box.id);
  const dag = acyclicLinks(ids, links);
  const byId = new Map(boxes.map((box) => [box.id, box]));
  return placeLayers(orderLayers(layersOf(ids, dag), dag).map((layer) => layer.map((id) => byId.get(id)!)), settings);
};

/** Parent → children of a spanning forest: roots are boxes nothing points at, each box joins its first parent. */
function spanningForest(ids: string[], links: Link[]): { roots: string[]; kids: Map<string, string[]> } {
  const kids = new Map(ids.map((id) => [id, [] as string[]]));
  const reached = new Set<string>();
  const roots: string[] = [];
  const grow = (root: string) => {
    roots.push(root);
    reached.add(root);
    for (let queue = [root]; queue.length; ) {
      const id = queue.shift()!;
      for (const link of links) {
        if (link.from !== id || reached.has(link.to)) continue;
        reached.add(link.to);
        kids.get(id)!.push(link.to);
        queue.push(link.to);
      }
    }
  };
  for (const id of ids) if (!links.some((link) => link.to === id)) grow(id);
  for (const id of ids) if (!reached.has(id)) grow(id);
  return { roots, kids };
}

const placeTree: Placer = (boxes, links, { direction, gap, layerGap }) => {
  const isRight = direction === "right";
  const byId = new Map(boxes.map((box) => [box.id, box]));
  const { roots, kids } = spanningForest(boxes.map((box) => box.id), links);
  const cross = (id: string) => (isRight ? byId.get(id)!.height : byId.get(id)!.width);
  const main = (id: string) => (isRight ? byId.get(id)!.width : byId.get(id)!.height);
  const span = new Map<string, number>();
  const spanOf = (id: string): number => {
    const children = kids.get(id)!;
    const total = children.reduce((sum, child) => sum + spanOf(child), 0) + gap * Math.max(0, children.length - 1);
    span.set(id, Math.max(cross(id), total));
    return span.get(id)!;
  };
  const depthSizes: number[] = [];
  const measure = (id: string, depth: number) => {
    depthSizes[depth] = Math.max(depthSizes[depth] ?? 0, main(id));
    for (const child of kids.get(id)!) measure(child, depth + 1);
  };
  roots.forEach((root) => (spanOf(root), measure(root, 0)));
  const along = (depth: number) => depthSizes.slice(0, depth).reduce((sum, size) => sum + size + layerGap, 0);
  const positions = new Map<string, Point>();
  const middles = new Map<string, number>();
  const put = (id: string, depth: number, start: number) => {
    const children = kids.get(id)!;
    let cursor = start + (span.get(id)! - (children.reduce((sum, child) => sum + span.get(child)!, 0) + gap * Math.max(0, children.length - 1))) / 2;
    for (const child of children) {
      put(child, depth + 1, cursor);
      cursor += span.get(child)! + gap;
    }
    const over = children.length ? (middles.get(children[0])! + middles.get(children[children.length - 1])!) / 2 : start + span.get(id)! / 2;
    const at = Math.min(Math.max(over - cross(id) / 2, start), start + span.get(id)! - cross(id));
    middles.set(id, at + cross(id) / 2);
    positions.set(id, isRight ? { x: along(depth), y: at } : { x: at, y: along(depth) });
  };
  let start = 0;
  for (const root of roots) {
    put(root, 0, start);
    start += span.get(root)! + gap;
  }
  return positions;
};

const PLACERS: Record<LayoutAlgorithm, Placer> = { grid: placeGrid, flow: placeFlow, tree: placeTree, erd: placeFlow };

// --- Blocks: one level of siblings, groups sized around their own members. ---

/** The sibling among `ids` that `id` sits in (itself, or the group around it), if any. */
function siblingOf(id: string, ids: Set<string>, parents: Map<string, string | null>): string | undefined {
  for (let at: string | null | undefined = id; at; at = parents.get(at)) if (ids.has(at)) return at;
  return undefined;
}

function siblingLinks(ids: string[], context: Context): Link[] {
  const set = new Set(ids);
  const lifted = context.links.map((link) => ({ from: siblingOf(link.from, set, context.parents), to: siblingOf(link.to, set, context.parents) }));
  const unique = new Map<string, Link>();
  for (const { from, to } of lifted) if (from && to && from !== to) unique.set(`${from}>${to}`, { from, to });
  return [...unique.values()];
}

function arrangeGroup(id: string, context: Context): Block {
  const members = context.children.get(id) ?? [];
  const group = context.byId.get(id)!;
  if (members.length === 0) return { rects: new Map(), width: group.width, height: group.height };
  const inner = arrangeBlock(members, context);
  const rects = new Map([...inner.rects].map(([key, rect]) => [key, { ...rect, x: rect.x + GROUP_PADDING, y: rect.y + GROUP_HEADER }]));
  return { rects, width: Math.max(MIN_GROUP_WIDTH, inner.width + GROUP_PADDING * 2), height: inner.height + GROUP_HEADER + GROUP_PADDING };
}

/** Lays out siblings with the chosen placer and returns every rect (members included) relative to the block's corner. */
function arrangeBlock(ids: string[], context: Context): Block {
  const inner = new Map(ids.filter((id) => context.byId.get(id)!.type === "group").map((id) => [id, arrangeGroup(id, context)]));
  const boxes = ids.map((id) => ({ id, ...(inner.get(id) ?? sizeOf(context.byId.get(id)!)) }));
  const positions = context.placer(boxes, siblingLinks(ids, context), context.settings);
  const left = Math.min(...boxes.map((box) => positions.get(box.id)!.x));
  const top = Math.min(...boxes.map((box) => positions.get(box.id)!.y));
  const rects = new Map<string, Rect>();
  for (const box of boxes) {
    const at = positions.get(box.id)!;
    const corner = { x: Math.round(at.x - left), y: Math.round(at.y - top) };
    rects.set(box.id, { ...corner, width: box.width, height: box.height });
    for (const [key, rect] of inner.get(box.id)?.rects ?? []) rects.set(key, { ...rect, x: rect.x + corner.x, y: rect.y + corner.y });
  }
  const bounds = boundsOf([...rects.values()])!;
  return { rects, width: bounds.x + bounds.width, height: bounds.y + bounds.height };
}

function shifted(block: Block, origin: Point): Map<string, Rect> {
  return new Map([...block.rects].map(([id, rect]) => [id, { ...rect, x: rect.x + origin.x, y: rect.y + origin.y }]));
}

// --- Putting blocks on the board around what stays put. ---

/** Where the top-level block goes: the asked spot, else where the placed elements were, else right of everything else. */
function blockOrigin(block: Block, fixed: Rect[], preferred: Point | undefined, gap: number): Point {
  const fits = (at: Point) => !fixed.some((rect) => overlaps({ ...at, width: block.width, height: block.height }, rect, gap));
  if (preferred && fits(preferred)) return { x: Math.round(preferred.x), y: Math.round(preferred.y) };
  const taken = boundsOf(fixed);
  if (!taken) return { x: 0, y: 0 };
  return { x: Math.round(taken.x + taken.width + gap * 2), y: Math.round(taken.y) };
}

/** New members of a group that stays put go below its current members; the group (and those around it) grow to fit. */
function placeInFixedGroup(groupId: string, ids: string[], context: Context, result: Map<string, Rect>) {
  const block = arrangeBlock(ids, context);
  const group = result.get(groupId) ?? rectOf(context.byId.get(groupId)!);
  const staying = (context.children.get(groupId) ?? []).filter((id) => !ids.includes(id)).map((id) => result.get(id) ?? rectOf(context.byId.get(id)!));
  const below = boundsOf(staying);
  const origin = { x: Math.round(group.x + GROUP_PADDING), y: Math.round(below ? below.y + below.height + context.settings.gap : group.y + GROUP_HEADER) };
  for (const [id, rect] of shifted(block, origin)) result.set(id, rect);
  growToFit(groupId, { x: origin.x, y: origin.y, width: block.width, height: block.height }, context, result);
}

function growToFit(groupId: string | null, content: Rect, context: Context, result: Map<string, Rect>) {
  for (let id = groupId; id; id = context.parents.get(id) ?? null) {
    const group = result.get(id) ?? rectOf(context.byId.get(id)!);
    const width = Math.max(group.width, content.x + content.width + GROUP_PADDING - group.x);
    const height = Math.max(group.height, content.y + content.height + GROUP_PADDING - group.y);
    if (width === group.width && height === group.height) return;
    content = { ...group, width, height };
    result.set(id, content);
  }
}

/** The elements to place: the asked ones plus everything inside a placed group. */
function placedIds(nodes: DiagramNode[], place: string[] | undefined, parents: Map<string, string | null>): Set<string> {
  if (!place) return new Set(nodes.map((node) => node.id));
  const asked = new Set(place);
  return new Set(nodes.filter((node) => siblingOf(node.id, asked, parents)).map((node) => node.id));
}

/** The layout that fits the elements: erd for mostly tables, tree for one-root hierarchies, flow for lines, else grid. */
export function pickAlgorithm(nodes: DiagramNode[], edges: DiagramEdge[]): LayoutAlgorithm {
  const ids = new Set(nodes.filter((node) => node.type !== "group").map((node) => node.id));
  const lines = edges.filter((edge) => ids.has(edge.from) && ids.has(edge.to) && edge.from !== edge.to);
  if (nodes.filter((node) => node.type === "table").length * 2 > ids.size) return "erd";
  if (lines.length === 0) return "grid";
  const targets = lines.map((edge) => edge.to);
  const isTree = new Set(targets).size === targets.length && lines.length === ids.size - 1 && spanningForest([...ids], lines).roots.length === 1;
  return isTree ? "tree" : "flow";
}

function settingsFor(algorithm: LayoutAlgorithm, options: LayoutOptions): Settings {
  const gap = options.spacing ?? (algorithm === "erd" ? ERD_GAP : DEFAULT_GAP);
  const direction = options.direction ?? (algorithm === "tree" ? "down" : "right");
  return { direction, gap, layerGap: algorithm === "erd" ? gap : gap * 2 };
}

/**
 * New rects for the placed elements and for any group that had to grow around new members. Elements left out of
 * `place` never move; placed elements never overlap them or each other; groups keep containing their members.
 */
export function autoLayout(nodes: DiagramNode[], edges: DiagramEdge[], options: LayoutOptions = {}): Map<string, Rect> {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const parents = groupParents(nodes, options.parents);
  const placed = placedIds(nodes, options.place, parents);
  const placedNodes = nodes.filter((node) => placed.has(node.id));
  if (placedNodes.length === 0) return new Map();
  const live = edges.filter((edge) => byId.has(edge.from) && byId.has(edge.to));
  const algorithm = !options.algorithm || options.algorithm === "auto" ? pickAlgorithm(placedNodes, live) : options.algorithm;
  const links = live.map((edge) => (algorithm === "erd" ? relationLink(edge, byId) : { from: edge.from, to: edge.to }));
  const context: Context = { byId, parents, children: childrenOf(nodes, parents), links, placer: PLACERS[algorithm], settings: settingsFor(algorithm, options) };
  const result = new Map<string, Rect>();
  const tops = placedNodes.filter((node) => !placed.has(parents.get(node.id) ?? ""));
  const hosts = [...new Set(tops.map((node) => parents.get(node.id) ?? null))];
  for (const host of hosts.filter((id): id is string => id !== null)) placeInFixedGroup(host, tops.filter((node) => parents.get(node.id) === host).map((node) => node.id), context, result);
  const loose = tops.filter((node) => !parents.get(node.id)).map((node) => node.id);
  if (loose.length === 0) return result;
  const block = arrangeBlock(loose, context);
  const fixed = nodes.filter((node) => !placed.has(node.id)).map((node) => result.get(node.id) ?? rectOf(node));
  const preferred = options.origin ?? (fixed.length === 0 ? boundsOf(placedNodes.map(rectOf))! : undefined);
  for (const [id, rect] of shifted(block, blockOrigin(block, fixed, preferred, context.settings.gap))) result.set(id, rect);
  return result;
}

/** The nodes with the rects from `autoLayout` applied. */
export function applyLayout(nodes: DiagramNode[], rects: Map<string, Rect>): DiagramNode[] {
  return nodes.map((node) => (rects.has(node.id) ? { ...node, ...rects.get(node.id)! } : node));
}
