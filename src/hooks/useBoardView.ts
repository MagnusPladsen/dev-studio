import { useEffect, useRef, useState, type RefObject } from "react";
import type { Point, Rect } from "@/lib/diagrams/geometry";

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 3;
/** Room kept around the cards when fitting them in view. */
const FIT_MARGIN = 80;

export const clampZoom = (z: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));

/**
 * Pan and zoom of a board viewport: converts screen points to board points, zooms around a point,
 * and zooms with the wheel (a trackpad pinch arrives as ctrl+wheel with small steps).
 */
export function useBoardView(viewportRef: RefObject<HTMLDivElement | null>) {
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const view = useRef({ pan, zoom });
  view.current = { pan, zoom };

  function toBoard(clientX: number, clientY: number): Point {
    const rect = viewportRef.current?.getBoundingClientRect();
    const { pan: p, zoom: z } = view.current;
    if (!rect) return { x: 0, y: 0 };
    return { x: (clientX - rect.left - p.x) / z, y: (clientY - rect.top - p.y) / z };
  }

  function viewportCenter(): Point {
    const rect = viewportRef.current?.getBoundingClientRect();
    return rect ? toBoard(rect.left + rect.width / 2, rect.top + rect.height / 2) : { x: 0, y: 0 };
  }

  function zoomAround(clientX: number, clientY: number, nextZoom: number) {
    const rect = viewportRef.current?.getBoundingClientRect();
    const { pan: p, zoom: z } = view.current;
    const target = clampZoom(nextZoom);
    if (!rect) return setZoom(target);
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    setPan({ x: mx - ((mx - p.x) / z) * target, y: my - ((my - p.y) / z) * target });
    setZoom(target);
  }

  function zoomBy(factor: number) {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (rect) zoomAround(rect.left + rect.width / 2, rect.top + rect.height / 2, view.current.zoom * factor);
  }

  /** Centres `bounds` in the viewport at up to 100%; with nothing to fit it goes back to the origin. */
  function fitTo(bounds: Rect | null) {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect || !bounds) return reset();
    const z = clampZoom(Math.min(1, (rect.width - FIT_MARGIN) / bounds.width, (rect.height - FIT_MARGIN) / bounds.height));
    setZoom(z);
    setPan({ x: rect.width / 2 - (bounds.x + bounds.width / 2) * z, y: rect.height / 2 - (bounds.y + bounds.height / 2) * z });
  }

  function reset() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.ctrlKey ? Math.exp(-e.deltaY * 0.01) : e.deltaY > 0 ? 0.9 : 1.1;
      zoomAround(e.clientX, e.clientY, view.current.zoom * factor);
    };
    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  });

  return { pan, zoom, view, setPan, setZoom, toBoard, viewportCenter, zoomAround, zoomBy, fitTo, reset };
}
