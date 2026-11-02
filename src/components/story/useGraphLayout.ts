import { useEffect, useMemo, useState } from "react";
import type { Point } from "@/lib/menu-position";
import { createSimulation, reheat, runSimulation, tickSimulation, type Simulation, type StoryGraph } from "@/lib/story-graph";

const SETTLE_TICKS = 600;
const TICKS_PER_FRAME = 2;

/** Holds the running layout outside React state; the hook re-renders once per animation frame while it moves. */
class LayoutStore {
  simulation: Simulation | null = null;
  private graph: StoryGraph | null = null;
  private frame: number | null = null;
  private onFrame: (() => void) | null = null;

  use(graph: StoryGraph): Simulation {
    if (graph === this.graph && this.simulation) return this.simulation;
    const previous = this.simulation;
    this.simulation = createSimulation(graph, previous ?? undefined);
    this.graph = graph;
    if (previous) reheat(this.simulation, 0.6);
    else runSimulation(this.simulation, SETTLE_TICKS);
    return this.simulation;
  }

  attach(onFrame: () => void): () => void {
    this.onFrame = onFrame;
    this.start();
    return () => {
      if (this.frame !== null) cancelAnimationFrame(this.frame);
      this.frame = null;
      this.onFrame = null;
    };
  }

  start(): void {
    if (this.frame !== null || !this.onFrame) return;
    this.frame = requestAnimationFrame(() => this.step());
  }

  private step(): void {
    this.frame = null;
    let isMoving = false;
    for (let i = 0; i < TICKS_PER_FRAME && this.simulation; i++) isMoving = tickSimulation(this.simulation) || isMoving;
    this.onFrame?.();
    if (isMoving) this.start();
  }

  drag(index: number, world: Point): void {
    const node = this.simulation?.nodes[index];
    if (!node || !this.simulation) return;
    Object.assign(node, { x: world.x, y: world.y, isFixed: true });
    reheat(this.simulation, 0.3);
    this.start();
  }

  release(index: number): void {
    const node = this.simulation?.nodes[index];
    if (node) node.isFixed = false;
  }
}

export interface GraphLayout {
  simulation: Simulation;
  drag(index: number, world: Point): void;
  release(index: number): void;
}

export function useGraphLayout(graph: StoryGraph): GraphLayout {
  const [store] = useState(() => new LayoutStore());
  const [, setFrame] = useState(0);
  const simulation = useMemo(() => store.use(graph), [store, graph]);

  useEffect(() => store.attach(() => setFrame((frame) => frame + 1)), [store, simulation]);

  return useMemo(
    () => ({ simulation, drag: (index, world) => store.drag(index, world), release: (index) => store.release(index) }),
    [store, simulation]
  );
}
