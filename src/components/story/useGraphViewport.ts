import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { centerOn, fitCamera, zoomAt, type Camera, type Circle } from "@/lib/graph-camera";
import type { Point } from "@/lib/menu-position";

export interface Size {
  width: number;
  height: number;
}

export interface GraphViewport {
  camera: Camera;
  size: Size;
  setCamera: React.Dispatch<React.SetStateAction<Camera>>;
  zoomBy(factor: number): void;
  fit(): void;
  focus(world: Point): void;
}

const WHEEL_SENSITIVITY = 0.0015;
const FOCUS_SCALE = 1.4;

/**
 * Camera state for an element, fitted to the graph once its size is known (after `beforeFirstFit` has had a chance
 * to reshape the layout for it); wheel zooms around the cursor.
 */
export function useGraphViewport(
  elementRef: RefObject<SVGSVGElement | null>,
  getCircles: () => Circle[],
  beforeFirstFit: (size: Size) => void = () => undefined
): GraphViewport {
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, scale: 1 });
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  const circlesRef = useRef(getCircles);
  const sizeRef = useRef(size);

  useEffect(() => {
    circlesRef.current = getCircles;
    sizeRef.current = size;
  });

  useResizeFit(elementRef, setSize, (next) => {
    beforeFirstFit(next);
    setCamera(fitCamera(circlesRef.current(), next));
  });
  useWheelZoom(elementRef, setCamera);

  const zoomBy = useCallback((factor: number) => {
    const { width, height } = sizeRef.current;
    setCamera((current) => zoomAt(current, factor, { x: width / 2, y: height / 2 }));
  }, []);
  const fit = useCallback(() => setCamera(fitCamera(circlesRef.current(), sizeRef.current)), []);
  const focus = useCallback((world: Point) => {
    setCamera((current) => centerOn(current, world, sizeRef.current, Math.max(current.scale, FOCUS_SCALE)));
  }, []);

  return { camera, size, setCamera, zoomBy, fit, focus };
}

function useResizeFit(elementRef: RefObject<SVGSVGElement | null>, setSize: (size: Size) => void, onFirstSize: (size: Size) => void): void {
  const firstRef = useRef(onFirstSize);
  useEffect(() => {
    firstRef.current = onFirstSize;
  });
  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    let hasFitted = false;
    const observer = new ResizeObserver(([entry]) => {
      const next = { width: entry.contentRect.width, height: entry.contentRect.height };
      setSize(next);
      if (!hasFitted && next.width > 0 && next.height > 0) {
        hasFitted = true;
        firstRef.current(next);
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [elementRef, setSize]);
}

function useWheelZoom(elementRef: RefObject<SVGSVGElement | null>, setCamera: GraphViewport["setCamera"]): void {
  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const anchor = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const factor = Math.exp(-event.deltaY * WHEEL_SENSITIVITY * (event.ctrlKey ? 4 : 1));
      setCamera((current) => zoomAt(current, factor, anchor));
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [elementRef, setCamera]);
}
