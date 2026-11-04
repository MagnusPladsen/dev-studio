import { describe, expect, it } from "vitest";
import type { Diagram, DiagramEdge, DiagramNode } from "@/types";
import { devStudioExamples } from "@/lib/examples/dev-studio";
import { relation, table } from "@/lib/examples/erd";
import { planningExamples } from "@/lib/examples/planning";
import type { ExampleModule } from "@/lib/examples/types";
import { applyLayout, autoLayout, groupParents, pickAlgorithm, type LayoutAlgorithm, type LayoutOptions } from "./auto-layout";
import type { Rect } from "./geometry";
import { tableHeight } from "./tables";

const ctx = { projectId: "p", id: (slug: string) => `p--ex--${slug}` };
const canvasesOf = (modules: ExampleModule[]) =>
  modules.filter((m) => m.collection === "diagrams").flatMap((m) => m.build(ctx) as unknown as Diagram[]);
const canvases = [...canvasesOf(planningExamples), ...canvasesOf(devStudioExamples)];
const ALGORITHMS: LayoutAlgorithm[] = ["grid", "flow", "tree", "erd"];

const card = (id: string, width = 120, height = 60, x = 0, y = 0): DiagramNode => ({ id, type: "state", x, y, width, height, label: id });
const group = (id: string, x: number, y: number, width: number, height: number): DiagramNode => ({ id, type: "group", x, y, width, height, label: id });
const line = (from: string, to: string): DiagramEdge => ({ id: `${from}>${to}`, from, to, type: "arrow" });

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const contains = (outer: Rect, inner: Rect) =>
  inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;

function isAncestor(id: string, of: string, parents: Map<string, string | null>): boolean {
  for (let at = parents.get(of); at; at = parents.get(at)) if (at === id) return true;
  return false;
}

/** Laid-out nodes, checked: no two unrelated elements overlap, every member sits inside its group, groups stay the same. */
function layOutAndCheck(nodes: DiagramNode[], edges: DiagramEdge[], options: LayoutOptions = {}): DiagramNode[] {
  const parents = groupParents(nodes, options.parents);
  const rects = autoLayout(nodes, edges, options);
  const after = applyLayout(nodes, rects);
  const byId = new Map(after.map((node) => [node.id, node]));
  for (const [index, a] of after.entries()) {
    for (const b of after.slice(index + 1)) {
      const isRelated = isAncestor(a.id, b.id, parents) || isAncestor(b.id, a.id, parents);
      const hasMoved = rects.has(a.id) || rects.has(b.id);
      if (hasMoved && !isRelated && overlaps(a, b)) throw new Error(`${a.id} overlaps ${b.id}`);
    }
    const parent = parents.get(a.id);
    const hasMoved = rects.has(a.id) || (parent !== null && rects.has(parent!));
    if (parent && hasMoved && !contains(byId.get(parent)!, a)) throw new Error(`${a.id} sticks out of ${parent}`);
  }
  expect(groupParents(after)).toEqual(parents);
  return after;
}

describe("autoLayout on the example canvases", () => {
  for (const canvas of canvases) {
    for (const algorithm of [...ALGORITHMS, "auto" as const]) {
      for (const direction of ["right", "down"] as const) {
        it(`should keep ${canvas.name} tidy with ${algorithm} ${direction}`, () => {
          layOutAndCheck(canvas.nodes, canvas.edges, { algorithm, direction });
        });
      }
    }
  }

  it("should give the same result every time", () => {
    for (const canvas of canvases) {
      expect(autoLayout(canvas.nodes, canvas.edges)).toEqual(autoLayout(structuredClone(canvas.nodes), structuredClone(canvas.edges)));
    }
  });

  it("should not care where the elements were before, apart from the corner", () => {
    for (const canvas of canvases.filter((c) => !c.nodes.some((n) => n.type === "group"))) {
      const shuffled = canvas.nodes.map((node, index) => ({ ...node, x: node.x + index * 37, y: node.y - index * 11 }));
      const at = { x: 0, y: 0 };
      expect(autoLayout(shuffled, canvas.edges, { origin: at })).toEqual(autoLayout(canvas.nodes, canvas.edges, { origin: at }));
    }
  });
});

describe("grid", () => {
  it("should lay cards out in rows of √n, row height from the tallest card", () => {
    const nodes = [card("a"), card("b", 120, 100), card("c"), card("d"), card("e")];
    const rects = autoLayout(nodes, [], { algorithm: "grid", origin: { x: 0, y: 0 } });
    expect(Object.fromEntries([...rects].map(([id, r]) => [id, [r.x, r.y]]))).toEqual({
      a: [0, 0],
      b: [160, 0],
      c: [320, 0],
      d: [0, 140],
      e: [160, 140],
    });
  });
});

describe("flow", () => {
  const nodes = ["start", "check", "yes", "no", "end"].map((id) => card(id));
  const edges = [line("start", "check"), line("check", "yes"), line("check", "no"), line("yes", "end"), line("no", "end")];

  it("should put each step one layer after the steps leading to it", () => {
    const rects = autoLayout(nodes, edges, { algorithm: "flow", origin: { x: 0, y: 0 } });
    expect(["start", "check", "yes", "no", "end"].map((id) => rects.get(id)!.x)).toEqual([0, 200, 400, 400, 600]);
    expect(rects.get("yes")!.y).toBeLessThan(rects.get("no")!.y);
    expect(rects.get("start")!.y).toBe(rects.get("end")!.y);
  });

  it("should run top to bottom when asked", () => {
    const rects = autoLayout(nodes, edges, { algorithm: "flow", direction: "down", origin: { x: 0, y: 0 } });
    expect(["start", "check", "yes", "end"].map((id) => rects.get(id)!.y)).toEqual([0, 140, 280, 420]);
  });

  it("should survive cycles", () => {
    const looped = [...edges, line("end", "start")];
    expect(() => layOutAndCheck(nodes, looped, { algorithm: "flow" })).not.toThrow();
  });
});

describe("tree", () => {
  it("should centre each parent over its children", () => {
    const nodes = ["root", "a", "b", "a1", "a2"].map((id) => card(id, 100, 40));
    const edges = [line("root", "a"), line("root", "b"), line("a", "a1"), line("a", "a2")];
    const rects = layOutAndCheck(nodes, edges, { algorithm: "tree", origin: { x: 0, y: 0 } });
    const middle = (id: string) => rects.find((n) => n.id === id)!.x + 50;
    expect(middle("a")).toBe((middle("a1") + middle("a2")) / 2);
    expect(middle("root")).toBe((middle("a") + middle("b")) / 2);
    expect(rects.find((n) => n.id === "a1")!.y).toBe((40 + 80) * 2);
  });
});

describe("erd", () => {
  const users = table("users", 0, 0, "users", [["id", "uuid", "PK"], ["name", "text"]]);
  const habits = table("habits", 0, 0, "habits", [["id", "uuid", "PK"], ["user_id", "uuid", "FK"], ["title", "text"], ["streak", "int"]]);
  const checks = table("checks", 0, 0, "checks", [["id", "uuid", "PK"], ["habit_id", "uuid", "FK"]]);
  const edges = [relation("r1", "habits.user_id", "users.id"), relation("r2", "checks.habit_id", "habits.id")];

  it("should put referenced tables left of the tables pointing at them", () => {
    const rects = autoLayout([checks, habits, users], edges, { algorithm: "erd", origin: { x: 0, y: 0 } });
    expect(rects.get("users")!.x).toBeLessThan(rects.get("habits")!.x);
    expect(rects.get("habits")!.x).toBeLessThan(rects.get("checks")!.x);
    expect(rects.get("habits")!.x - (rects.get("users")!.x + users.width)).toBe(80);
  });

  it("should follow the foreign key row when the cardinality doesn't say which way", () => {
    const rects = autoLayout([habits, users], [relation("r", "users.id", "habits.user_id", "one-to-one")], { algorithm: "erd" });
    expect(rects.get("users")!.x).toBeLessThan(rects.get("habits")!.x);
  });

  it("should size tables by their rows", () => {
    const rects = autoLayout([{ ...habits, height: 10 }], [], { algorithm: "erd" });
    expect(rects.get("habits")!.height).toBe(tableHeight(4));
  });

  it("should be picked when most elements are tables", () => {
    expect(pickAlgorithm([users, habits, card("note")], edges)).toBe("erd");
  });
});

describe("pickAlgorithm", () => {
  it("should pick grid without lines, tree for one root, flow otherwise", () => {
    const nodes = ["a", "b", "c"].map((id) => card(id));
    expect(pickAlgorithm(nodes, [])).toBe("grid");
    expect(pickAlgorithm(nodes, [line("a", "b"), line("a", "c")])).toBe("tree");
    expect(pickAlgorithm(nodes, [line("a", "c"), line("b", "c")])).toBe("flow");
  });
});

describe("groups", () => {
  const nodes = [group("g", 0, 0, 400, 300), card("in1", 120, 60, 20, 50), card("in2", 120, 60, 200, 50), card("out", 120, 60, 600, 0), card("other", 80, 80, 600, 300)];
  const edges = [line("in1", "in2"), line("in2", "out")];

  it("should size the group snugly around its laid-out members", () => {
    const after = layOutAndCheck(nodes, edges, { algorithm: "flow", origin: { x: 0, y: 0 } });
    const byId = new Map(after.map((n) => [n.id, n]));
    expect(byId.get("in1")).toMatchObject({ x: 16, y: 40 });
    expect(byId.get("g")).toMatchObject({ x: 0, y: 0, width: 16 + 120 + 80 + 120 + 16, height: 40 + 60 + 16 });
  });

  it("should lay out nested groups inside out", () => {
    const nested = [group("outer", 0, 0, 800, 600), group("inner", 20, 50, 300, 200), card("a", 100, 40, 40, 100), card("b", 100, 40, 500, 100)];
    expect(() => layOutAndCheck(nested, [line("a", "b")], { algorithm: "flow" })).not.toThrow();
  });

  it("should take the group from `parents` over where an element sits", () => {
    const after = layOutAndCheck(nodes, edges, { algorithm: "grid", parents: { out: "g" } });
    expect(groupParents(after).get("out")).toBe("g");
  });
});

describe("placing only new elements", () => {
  const existing = [card("a", 120, 60, 100, 100), card("b", 120, 60, 400, 100), group("g", 100, 300, 300, 200), card("m", 120, 60, 120, 350)];
  const fresh = [card("n1"), card("n2"), card("n3")];
  const edges = [line("a", "n1"), line("n1", "n2"), line("n2", "n3")];
  const rectsOf = (nodes: DiagramNode[], ids: string[]) => nodes.filter((n) => ids.includes(n.id));

  it("should never move what was already there", () => {
    const after = layOutAndCheck([...existing, ...fresh], edges, { place: ["n1", "n2", "n3"], parents: { n1: null, n2: null, n3: null } });
    expect(rectsOf(after, ["a", "b", "g", "m"])).toEqual(existing);
  });

  it("should put the new block right of the existing content", () => {
    const rects = autoLayout([...existing, ...fresh], edges, { place: ["n1", "n2", "n3"], parents: { n1: null, n2: null, n3: null } });
    expect(rects.size).toBe(3);
    expect(Math.min(...[...rects.values()].map((r) => r.x))).toBe(520 + 80);
  });

  it("should use the asked origin when it is free", () => {
    const rects = autoLayout([...existing, ...fresh], [], { place: ["n1"], origin: { x: 100, y: 800 }, parents: { n1: null } });
    expect(rects.get("n1")).toMatchObject({ x: 100, y: 800 });
  });

  it("should put new members of a group that stays below its members and grow only the group", () => {
    const after = layOutAndCheck([...existing, ...fresh], [], { place: ["n1", "n2"], parents: { n1: "g", n2: "g", n3: null }, algorithm: "grid" });
    const byId = new Map(after.map((n) => [n.id, n]));
    expect(byId.get("n1")).toMatchObject({ x: 116, y: 450 });
    expect(byId.get("g")).toMatchObject({ x: 100, y: 300, width: 16 + 120 + 40 + 120 + 16, height: 450 + 60 + 16 - 300 });
    expect(rectsOf(after, ["a", "b", "m", "n3"])).toEqual(rectsOf([...existing, ...fresh], ["a", "b", "m", "n3"]));
  });

  it("should change nothing when there is nothing to place", () => {
    expect(autoLayout(existing, [], { place: [] }).size).toBe(0);
  });
});

describe("autoLayout on random canvases", () => {
  /** A small seeded generator, so a failing canvas can be reproduced from its seed. */
  function randomCanvas(seed: number): { nodes: DiagramNode[]; edges: DiagramEdge[] } {
    let state = seed;
    const next = (below: number) => {
      state = (state * 1103515245 + 12345) % 2147483648;
      return state % below;
    };
    const groups = Array.from({ length: next(3) }, (_, index) => group(`g${index}`, index * 700, 0, 600, 600));
    const cards = Array.from({ length: 2 + next(14) }, (_, index) => card(`c${index}`, 60 + next(140), 30 + next(120), next(2000), next(700)));
    const edges = Array.from({ length: next(cards.length * 2) }, () => line(cards[next(cards.length)].id, cards[next(cards.length)].id));
    return { nodes: [...groups, ...cards], edges };
  }

  for (let seed = 1; seed <= 40; seed++) {
    it(`should keep random canvas ${seed} tidy with every algorithm, whole or in part`, () => {
      const { nodes, edges } = randomCanvas(seed);
      for (const algorithm of ALGORITHMS) {
        layOutAndCheck(nodes, edges, { algorithm });
        const place = nodes.filter((_, index) => index % 3 === 0).map((node) => node.id);
        const options = { algorithm, place, parents: Object.fromEntries(place.map((id) => [id, null])) };
        const moved = autoLayout(nodes, edges, options);
        const after = layOutAndCheck(nodes, edges, options);
        const kept = nodes.filter((node) => !moved.has(node.id));
        expect(after.filter((node) => kept.some((k) => k.id === node.id))).toEqual(kept);
        expect([...moved.keys()].every((id) => place.includes(id) || place.includes(groupParents(nodes).get(id) ?? ""))).toBe(true);
      }
    });
  }
});
