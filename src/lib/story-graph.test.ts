import { describe, expect, it } from "vitest";
import type { AssetType } from "@/types";
import {
  buildStoryGraph,
  createSimulation,
  isLabelVisible,
  neighbourMap,
  nodeRadius,
  runSimulation,
  searchNodes,
  tickSimulation,
  type GraphRelation,
  type StoryGraphInput,
} from "./story-graph";

const entries = [
  { id: "hero", title: "Hero", type: "character" },
  { id: "town", title: "Town", type: "location" },
  { id: "sword", title: "Sword", type: "item" },
  { id: "alone", title: "Hermit", type: "character" },
];

const relations: Record<string, GraphRelation[]> = {
  hero: [
    { type: "story", id: "town", name: "Town", source: "wiki" },
    { type: "story", id: "sword", name: "Sword", source: "story" },
    { type: "sprite", id: "hero-sprite", name: "Hero sprite", source: "link" },
  ],
  town: [
    { type: "story", id: "hero", name: "Hero", source: "wiki" },
    { type: "tilemap", id: "town-map", name: "Town map", source: "story" },
  ],
  sword: [{ type: "story", id: "hero", name: "Hero", source: "story" }],
  alone: [{ type: "story", id: "deleted", name: "Gone", source: "wiki" }],
};

function input(includeAssets: boolean): StoryGraphInput {
  return {
    entries,
    relatedOf: (id) => relations[id] ?? [],
    typeMeta: (type) => ({ color: `type-${type}`, label: type }),
    assetMeta: (type: AssetType) => ({ color: `asset-${type}`, label: type }),
    includeAssets,
  };
}

describe("buildStoryGraph", () => {
  it("should make one node per entry, coloured by entry type", () => {
    const graph = buildStoryGraph(input(false));
    expect(graph.nodes.map((n) => n.key)).toEqual(["story:hero", "story:town", "story:sword", "story:alone"]);
    expect(graph.nodes[1].color).toBe("type-location");
  });

  it("should dedupe edges found from both ends and keep their source", () => {
    const graph = buildStoryGraph(input(false));
    expect(graph.edges).toHaveLength(2);
    expect(graph.edges.find((e) => e.key === "story:hero|story:town")?.source).toBe("wiki");
  });

  it("should leave out linked assets unless asked, and links to missing entries always", () => {
    expect(buildStoryGraph(input(false)).nodes.some((n) => n.kind === "asset")).toBe(false);
    const withAssets = buildStoryGraph(input(true));
    const sprite = withAssets.nodes.find((n) => n.key === "sprite:hero-sprite");
    expect(sprite).toMatchObject({ kind: "asset", color: "asset-sprite", degree: 1 });
    expect(withAssets.nodes.some((n) => n.id === "deleted")).toBe(false);
    expect(withAssets.edges).toHaveLength(4);
  });

  it("should size nodes by their number of connections", () => {
    const graph = buildStoryGraph(input(true));
    const hero = graph.nodes.find((n) => n.id === "hero")!;
    const hermit = graph.nodes.find((n) => n.id === "alone")!;
    expect(hero.degree).toBe(3);
    expect(hermit.degree).toBe(0);
    expect(hero.radius).toBeGreaterThan(hermit.radius);
  });
});

describe("nodeRadius", () => {
  it("should keep asset nodes smaller than story nodes and cap growth", () => {
    expect(nodeRadius("asset", 4)).toBeLessThan(nodeRadius("story", 4));
    expect(nodeRadius("story", 10_000)).toBe(24);
  });
});

describe("neighbourMap", () => {
  it("should list neighbours in both directions", () => {
    const map = neighbourMap(buildStoryGraph(input(false)).edges);
    expect([...map.get("story:hero")!].sort()).toEqual(["story:sword", "story:town"]);
    expect(map.get("story:town")!.has("story:hero")).toBe(true);
    expect(map.has("story:alone")).toBe(false);
  });
});

describe("searchNodes", () => {
  const { nodes } = buildStoryGraph(input(true));

  it("should return nothing for an empty query", () => {
    expect(searchNodes(nodes, "  ")).toEqual([]);
  });

  it("should rank prefix matches first, case-insensitively", () => {
    expect(searchNodes(nodes, "TOWN").map((n) => n.title)).toEqual(["Town", "Town map"]);
    expect(searchNodes(nodes, "o").map((n) => n.title)[0]).toBe("Hero");
  });
});

describe("isLabelVisible", () => {
  it("should hide small labels when zoomed out unless emphasised", () => {
    expect(isLabelVisible(4, 0.5, false)).toBe(false);
    expect(isLabelVisible(4, 0.5, true)).toBe(true);
    expect(isLabelVisible(12, 0.5, false)).toBe(true);
  });
});

describe("force layout", () => {
  it("should cool down and stop", () => {
    const simulation = createSimulation(buildStoryGraph(input(true)));
    const ticks = runSimulation(simulation, 5000);
    expect(ticks).toBeLessThan(5000);
    expect(tickSimulation(simulation)).toBe(false);
  });

  it("should keep linked nodes closer than unlinked ones and spread nodes apart", () => {
    const simulation = createSimulation(buildStoryGraph(input(false)));
    runSimulation(simulation, 5000);
    const at = (key: string) => simulation.nodes.find((n) => n.key === key)!;
    const gap = (a: string, b: string) => Math.hypot(at(a).x - at(b).x, at(a).y - at(b).y);
    expect(gap("story:hero", "story:town")).toBeLessThan(gap("story:town", "story:sword"));
    for (const a of simulation.nodes) {
      for (const b of simulation.nodes) if (a !== b) expect(gap(a.key, b.key)).toBeGreaterThan(a.radius + b.radius);
    }
    expect(simulation.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y))).toBe(true);
  });

  it("should not move fixed nodes", () => {
    const simulation = createSimulation(buildStoryGraph(input(false)));
    Object.assign(simulation.nodes[0], { x: 500, y: -500, isFixed: true });
    runSimulation(simulation, 50);
    expect(simulation.nodes[0]).toMatchObject({ x: 500, y: -500 });
  });

  it("should keep positions of nodes that survive a rebuild", () => {
    const first = createSimulation(buildStoryGraph(input(false)));
    runSimulation(first, 100);
    const hero = { ...first.nodes[0] };
    const next = createSimulation(buildStoryGraph(input(true)), first);
    expect(next.nodes[0]).toMatchObject({ key: hero.key, x: hero.x, y: hero.y });
    expect(next.nodes.length).toBeGreaterThan(first.nodes.length);
  });

  it("should lay out the same graph the same way every time", () => {
    const a = createSimulation(buildStoryGraph(input(true)));
    const b = createSimulation(buildStoryGraph(input(true)));
    runSimulation(a, 300);
    runSimulation(b, 300);
    expect(a.nodes).toEqual(b.nodes);
  });
});
