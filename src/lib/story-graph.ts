import type { AssetType } from "@/types";
import type { LinkSource } from "./links";

/** Story entries and linked assets as a graph, plus a small force-directed layout for it. */

export interface GraphNode {
  key: string;
  id: string;
  kind: "story" | "asset";
  assetType: AssetType;
  title: string;
  label: string;
  color: string;
  degree: number;
  radius: number;
}

export interface GraphEdge {
  key: string;
  from: string;
  to: string;
  source: LinkSource;
}

export interface StoryGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphEntry {
  id: string;
  title: string;
  type: string;
}

export interface GraphRelation {
  type: AssetType;
  id: string;
  name: string;
  source: LinkSource;
}

export interface StoryGraphInput {
  entries: GraphEntry[];
  relatedOf(entryId: string): GraphRelation[];
  typeMeta(entryType: string): { color: string; label: string };
  assetMeta(type: AssetType): { color: string; label: string };
  includeAssets: boolean;
}

const STORY_RADIUS = { min: 7, perLink: 3, max: 24 };
const ASSET_RADIUS = { min: 4, perLink: 1.5, max: 10 };

export function nodeRadius(kind: GraphNode["kind"], degree: number): number {
  const size = kind === "story" ? STORY_RADIUS : ASSET_RADIUS;
  return Math.min(size.max, size.min + size.perLink * Math.sqrt(degree));
}

export function nodeKey(type: AssetType, id: string): string {
  return `${type}:${id}`;
}

function edgeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function storyNodes(input: StoryGraphInput): Map<string, GraphNode> {
  const nodes = new Map<string, GraphNode>();
  for (const entry of input.entries) {
    const meta = input.typeMeta(entry.type);
    const key = nodeKey("story", entry.id);
    nodes.set(key, { key, id: entry.id, kind: "story", assetType: "story", title: entry.title || "Untitled", color: meta.color, label: meta.label, degree: 0, radius: 0 });
  }
  return nodes;
}

function assetNode(input: StoryGraphInput, relation: GraphRelation): GraphNode {
  const meta = input.assetMeta(relation.type);
  const key = nodeKey(relation.type, relation.id);
  return { key, id: relation.id, kind: "asset", assetType: relation.type, title: relation.name, color: meta.color, label: meta.label, degree: 0, radius: 0 };
}

function collectEdges(input: StoryGraphInput, nodes: Map<string, GraphNode>): Map<string, GraphEdge> {
  const edges = new Map<string, GraphEdge>();
  for (const entry of input.entries) {
    const from = nodeKey("story", entry.id);
    for (const relation of input.relatedOf(entry.id)) {
      const to = nodeKey(relation.type, relation.id);
      if (relation.type !== "story" && !input.includeAssets) continue;
      if (relation.type === "story" && !nodes.has(to)) continue;
      if (!nodes.has(to)) nodes.set(to, assetNode(input, relation));
      const key = edgeKey(from, to);
      if (from !== to && !edges.has(key)) edges.set(key, { key, from, to, source: relation.source });
    }
  }
  return edges;
}

export function buildStoryGraph(input: StoryGraphInput): StoryGraph {
  const nodes = storyNodes(input);
  const edges = [...collectEdges(input, nodes).values()];
  for (const edge of edges) {
    nodes.get(edge.from)!.degree++;
    nodes.get(edge.to)!.degree++;
  }
  const sized = [...nodes.values()].map((node) => ({ ...node, radius: nodeRadius(node.kind, node.degree) }));
  return { nodes: sized, edges };
}

export function neighbourMap(edges: GraphEdge[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  const link = (a: string, b: string): void => {
    if (!map.has(a)) map.set(a, new Set());
    map.get(a)!.add(b);
  };
  for (const edge of edges) {
    link(edge.from, edge.to);
    link(edge.to, edge.from);
  }
  return map;
}

/** Title matches for the search box: prefix matches first, then bigger nodes. */
export function searchNodes(nodes: GraphNode[], query: string, limit = 6): GraphNode[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const rank = (node: GraphNode): number => (node.title.toLowerCase().startsWith(needle) ? 0 : 1);
  return nodes
    .filter((node) => node.title.toLowerCase().includes(needle))
    .sort((a, b) => rank(a) - rank(b) || b.degree - a.degree || a.title.localeCompare(b.title))
    .slice(0, limit);
}

/** Hides labels of nodes that would be tiny on screen, unless the node is highlighted. */
export const LABEL_MIN_SCREEN_RADIUS = 5;

export function isLabelVisible(radius: number, scale: number, isEmphasised: boolean): boolean {
  return isEmphasised || radius * scale >= LABEL_MIN_SCREEN_RADIUS;
}

// ── force-directed layout ──

export interface SimNode {
  key: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  isFixed: boolean;
}

export interface Simulation {
  nodes: SimNode[];
  links: [number, number][];
  alpha: number;
}

export const LAYOUT = {
  charge: 220,
  linkDistance: 70,
  linkStrength: 0.08,
  gravity: 0.006,
  velocityDecay: 0.6,
  alphaDecay: 0.985,
  alphaMin: 0.002,
  maxRepelDistance: 600,
};

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** Deterministic starting spiral, so the same graph always settles the same way. */
export function seedPosition(index: number): { x: number; y: number } {
  const distance = 30 * Math.sqrt(index + 0.5);
  const angle = index * GOLDEN_ANGLE;
  return { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance };
}

export function createSimulation(graph: StoryGraph, previous?: Simulation): Simulation {
  const kept = new Map(previous?.nodes.map((node) => [node.key, node]));
  const nodes = graph.nodes.map((node, index): SimNode => {
    const old = kept.get(node.key);
    const start = old ?? { ...seedPosition(index), vx: 0, vy: 0 };
    return { key: node.key, x: start.x, y: start.y, vx: start.vx, vy: start.vy, radius: node.radius, isFixed: false };
  });
  const index = new Map(nodes.map((node, i) => [node.key, i]));
  const links = graph.edges.map((edge): [number, number] => [index.get(edge.from)!, index.get(edge.to)!]);
  return { nodes, links, alpha: 1 };
}

function applyRepulsion(nodes: SimNode[], alpha: number): void {
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      if (dx === 0 && dy === 0) [dx, dy] = [(j - i) * 0.01, 0.01];
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared > LAYOUT.maxRepelDistance ** 2) continue;
      const push = (LAYOUT.charge * alpha) / Math.max(distanceSquared, 25);
      a.vx -= dx * push;
      a.vy -= dy * push;
      b.vx += dx * push;
      b.vy += dy * push;
    }
  }
}

function applySprings(simulation: Simulation): void {
  const { nodes, links, alpha } = simulation;
  for (const [i, j] of links) {
    const a = nodes[i];
    const b = nodes[j];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const distance = Math.hypot(dx, dy) || 1;
    const rest = LAYOUT.linkDistance + a.radius + b.radius;
    const pull = ((distance - rest) / distance) * LAYOUT.linkStrength * alpha;
    a.vx += dx * pull;
    a.vy += dy * pull;
    b.vx -= dx * pull;
    b.vy -= dy * pull;
  }
}

function integrate(nodes: SimNode[], alpha: number): void {
  for (const node of nodes) {
    node.vx -= node.x * LAYOUT.gravity * alpha;
    node.vy -= node.y * LAYOUT.gravity * alpha;
    node.vx *= LAYOUT.velocityDecay;
    node.vy *= LAYOUT.velocityDecay;
    if (node.isFixed) {
      node.vx = 0;
      node.vy = 0;
      continue;
    }
    node.x += node.vx;
    node.y += node.vy;
  }
}

/** One step of the layout; returns false once it has cooled down and can stop. */
export function tickSimulation(simulation: Simulation): boolean {
  if (simulation.alpha < LAYOUT.alphaMin) return false;
  applyRepulsion(simulation.nodes, simulation.alpha);
  applySprings(simulation);
  integrate(simulation.nodes, simulation.alpha);
  simulation.alpha *= LAYOUT.alphaDecay;
  return true;
}

export function runSimulation(simulation: Simulation, maxTicks: number): number {
  let ticks = 0;
  while (ticks < maxTicks && tickSimulation(simulation)) ticks++;
  return ticks;
}

export function reheat(simulation: Simulation, alpha = 0.3): void {
  simulation.alpha = Math.max(simulation.alpha, alpha);
}
