import { useEffect, useRef, type RefObject } from "react";
import { distance, midpoint, screenToWorld, zoomAt, type Camera } from "@/lib/graph-camera";
import type { Point } from "@/lib/menu-position";
import type { GraphLayout } from "./useGraphLayout";
import type { GraphViewport } from "./useGraphViewport";

const TAP_TOLERANCE_PX = 4;

type Gesture =
  | { kind: "idle" }
  | { kind: "pan"; travelled: number }
  | { kind: "pinch" }
  | { kind: "node"; index: number; travelled: number };

interface GestureState {
  gesture: Gesture;
  pointers: Map<number, Point>;
  wasDrag: boolean;
}

export interface GraphGestures {
  onBackgroundPointerDown(event: React.PointerEvent<SVGSVGElement>): void;
  onNodePointerDown(event: React.PointerEvent<Element>, index: number): void;
  /** True once after a node was dragged, so the click that ends the drag doesn't open it. */
  consumeDrag(): boolean;
}

interface GestureDeps {
  svgRef: RefObject<SVGSVGElement | null>;
  viewport: GraphViewport;
  layout: GraphLayout;
  onBackgroundTap(): void;
}

function localPoint(svg: SVGSVGElement | null, event: { clientX: number; clientY: number }): Point {
  const rect = svg?.getBoundingClientRect();
  return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
}

function pinchCamera(camera: Camera, before: [Point, Point], after: [Point, Point]): Camera {
  const from = midpoint(...before);
  const to = midpoint(...after);
  const panned = { ...camera, x: camera.x + to.x - from.x, y: camera.y + to.y - from.y };
  return zoomAt(panned, distance(...after) / Math.max(distance(...before), 1), to);
}

function startGesture(state: GestureState, point: Point, pointerId: number, nodeIndex: number | null): void {
  state.pointers.set(pointerId, point);
  state.wasDrag = false;
  if (state.pointers.size === 2 && state.gesture.kind !== "node") state.gesture = { kind: "pinch" };
  else if (state.pointers.size === 1) {
    state.gesture = nodeIndex === null ? { kind: "pan", travelled: 0 } : { kind: "node", index: nodeIndex, travelled: 0 };
  }
}

function moveGesture(state: GestureState, deps: GestureDeps, pointerId: number, point: Point): void {
  const previous = state.pointers.get(pointerId);
  if (!previous) return;
  const before = [...state.pointers.values()] as [Point, Point];
  state.pointers.set(pointerId, point);
  const { gesture, pointers } = state;
  const step = distance(previous, point);
  if (gesture.kind === "pan") {
    gesture.travelled += step;
    deps.viewport.setCamera((c) => ({ ...c, x: c.x + point.x - previous.x, y: c.y + point.y - previous.y }));
  } else if (gesture.kind === "pinch" && pointers.size === 2) {
    const after = [...pointers.values()] as [Point, Point];
    deps.viewport.setCamera((c) => pinchCamera(c, before, after));
  } else if (gesture.kind === "node") {
    gesture.travelled += step;
    if (gesture.travelled > TAP_TOLERANCE_PX) deps.layout.drag(gesture.index, screenToWorld(deps.viewport.camera, point));
  }
}

function endGesture(state: GestureState, deps: GestureDeps, pointerId: number): void {
  if (!state.pointers.delete(pointerId)) return;
  const { gesture } = state;
  if (gesture.kind === "node") {
    deps.layout.release(gesture.index);
    state.wasDrag = gesture.travelled > TAP_TOLERANCE_PX;
  }
  if (gesture.kind === "pan" && gesture.travelled <= TAP_TOLERANCE_PX) deps.onBackgroundTap();
  if (state.pointers.size === 0) state.gesture = { kind: "idle" };
  else if (gesture.kind === "pinch") state.gesture = { kind: "pan", travelled: Infinity };
}

/** Pan by dragging the background, pinch to zoom, drag nodes; window listeners keep a drag alive off the element. */
export function useGraphGestures(deps: GestureDeps): GraphGestures {
  const stateRef = useRef<GestureState>({ gesture: { kind: "idle" }, pointers: new Map(), wasDrag: false });
  const depsRef = useRef(deps);
  useEffect(() => {
    depsRef.current = deps;
  });

  useEffect(() => {
    const onMove = (event: PointerEvent): void =>
      moveGesture(stateRef.current, depsRef.current, event.pointerId, localPoint(depsRef.current.svgRef.current, event));
    const onEnd = (event: PointerEvent): void => endGesture(stateRef.current, depsRef.current, event.pointerId);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
    };
  }, []);

  return {
    onBackgroundPointerDown(event) {
      if (event.button !== 0) return;
      startGesture(stateRef.current, localPoint(event.currentTarget, event), event.pointerId, null);
    },
    onNodePointerDown(event, index) {
      if (event.button !== 0) return;
      event.stopPropagation();
      startGesture(stateRef.current, localPoint(depsRef.current.svgRef.current, event), event.pointerId, index);
    },
    consumeDrag() {
      const wasDrag = stateRef.current.wasDrag;
      stateRef.current.wasDrag = false;
      return wasDrag;
    },
  };
}
