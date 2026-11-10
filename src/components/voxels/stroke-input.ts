import type { RayHit } from "@/lib/voxels/raycast";
import type { StrokeEvent } from "./types";
import { getHitKey } from "./viewport-helpers";

const TOUCH_START_DELAY_MS = 90;
const TAP_SLOP_PX = 6;
const TAP_MAX_MS = 350;

export interface StrokeInputOptions {
  canvas: HTMLCanvasElement;
  pick(clientX: number, clientY: number): RayHit | null;
  isOrbitPrimary(): boolean;
  /** Space is held: the drag only moves the camera, so no cube is placed, painted or removed. */
  isSpaceHeld(): boolean;
  onStroke(event: StrokeEvent): void;
  onHover(hit: RayHit | null): void;
}

interface PointerOrigin {
  pointerId: number;
  x: number;
  y: number;
  time: number;
  shiftKey: boolean;
}

interface ActiveStroke {
  pointerId: number;
  lastKey: string;
  lastValidHit: RayHit | null;
}

interface PendingTouch extends PointerOrigin {
  hit: RayHit | null;
  timer: ReturnType<typeof setTimeout>;
}

function hasMovedBeyondSlop(origin: PointerOrigin, event: PointerEvent): boolean {
  return Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > TAP_SLOP_PX;
}

function toOrigin(event: PointerEvent): PointerOrigin {
  return { pointerId: event.pointerId, x: event.clientX, y: event.clientY, time: event.timeStamp, shiftKey: event.shiftKey };
}

export class StrokeInput {
  private readonly touchIds = new Set<number>();
  private isGestureBlocked = false;
  private stroke: ActiveStroke | null = null;
  private pending: PendingTouch | null = null;
  private tap: PointerOrigin | null = null;
  private hoverPoint: { x: number; y: number } | null = null;
  private hoverFrame = 0;
  private lastHoverKey = "none";

  constructor(private readonly options: StrokeInputOptions) {
    const { canvas } = options;
    canvas.addEventListener("pointerdown", this.handlePointerDown);
    canvas.addEventListener("pointermove", this.handlePointerMove);
    canvas.addEventListener("pointerup", this.handlePointerUp);
    canvas.addEventListener("pointercancel", this.handlePointerCancel);
    canvas.addEventListener("pointerleave", this.handlePointerLeave);
    canvas.addEventListener("lostpointercapture", this.handleLostPointerCapture);
  }

  refreshHover(): void {
    if (this.hoverPoint && !this.stroke && !this.pending) this.scheduleHover();
  }

  detach(): void {
    if (this.pending) clearTimeout(this.pending.timer);
    this.cancelHover();
    const { canvas } = this.options;
    canvas.removeEventListener("pointerdown", this.handlePointerDown);
    canvas.removeEventListener("pointermove", this.handlePointerMove);
    canvas.removeEventListener("pointerup", this.handlePointerUp);
    canvas.removeEventListener("pointercancel", this.handlePointerCancel);
    canvas.removeEventListener("pointerleave", this.handlePointerLeave);
    canvas.removeEventListener("lostpointercapture", this.handleLostPointerCapture);
  }

  private beginStroke(pointerId: number, hit: RayHit | null, shiftKey: boolean): void {
    this.cancelHover();
    this.lastHoverKey = "";
    this.stroke = { pointerId, lastKey: getHitKey(hit), lastValidHit: hit };
    this.options.onStroke({ phase: "start", hit, shiftKey });
  }

  private readonly beginPendingStroke = (): void => {
    if (!this.pending) return;
    clearTimeout(this.pending.timer);
    const { pointerId, hit, shiftKey } = this.pending;
    this.pending = null;
    this.beginStroke(pointerId, hit, shiftKey);
  };

  private endStroke(shiftKey: boolean): void {
    if (!this.stroke) return;
    const hit = this.stroke.lastValidHit;
    this.stroke = null;
    this.options.onStroke({ phase: "end", hit, shiftKey });
  }

  private cancelEverything(): void {
    if (this.pending) clearTimeout(this.pending.timer);
    this.pending = null;
    this.tap = null;
    if (!this.stroke) return;
    this.stroke = null;
    this.options.onStroke({ phase: "cancel", hit: null, shiftKey: false });
  }

  private cancelHover(): void {
    if (this.hoverFrame) cancelAnimationFrame(this.hoverFrame);
    this.hoverFrame = 0;
  }

  private readonly emitHover = (): void => {
    this.hoverFrame = 0;
    if (!this.hoverPoint || this.stroke || this.pending) return;
    const hit = this.options.pick(this.hoverPoint.x, this.hoverPoint.y);
    const key = getHitKey(hit);
    if (key === this.lastHoverKey) return;
    this.lastHoverKey = key;
    this.options.onHover(hit);
  };

  private scheduleHover(): void {
    if (!this.hoverFrame) this.hoverFrame = requestAnimationFrame(this.emitHover);
  }

  private trackHover(event: PointerEvent): void {
    this.hoverPoint = { x: event.clientX, y: event.clientY };
    this.scheduleHover();
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    this.options.canvas.setPointerCapture(event.pointerId);
    if (event.pointerType === "touch") this.touchIds.add(event.pointerId);
    if (this.touchIds.size > 1) {
      this.cancelEverything();
      this.isGestureBlocked = true;
      return;
    }
    if (this.isGestureBlocked || event.button !== 0 || this.options.isSpaceHeld()) return;
    if (this.options.isOrbitPrimary()) {
      this.tap = toOrigin(event);
      return;
    }
    const hit = this.options.pick(event.clientX, event.clientY);
    if (event.pointerType !== "touch") {
      this.beginStroke(event.pointerId, hit, event.shiftKey);
      return;
    }
    this.pending = { ...toOrigin(event), hit, timer: setTimeout(this.beginPendingStroke, TOUCH_START_DELAY_MS) };
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (this.pending?.pointerId === event.pointerId && hasMovedBeyondSlop(this.pending, event)) {
      this.beginPendingStroke();
    }
    if (this.stroke?.pointerId === event.pointerId) {
      if (event.buttons === 0) this.endStroke(event.shiftKey);
      else this.continueStroke(this.stroke, event);
      return;
    }
    if (event.pointerType !== "touch" && event.buttons === 0) this.trackHover(event);
  };

  private continueStroke(stroke: ActiveStroke, event: PointerEvent): void {
    const hit = this.options.pick(event.clientX, event.clientY);
    const key = getHitKey(hit);
    if (key === stroke.lastKey) return;
    stroke.lastKey = key;
    if (hit) stroke.lastValidHit = hit;
    this.options.onStroke({ phase: "move", hit, shiftKey: event.shiftKey });
  }

  private finishTap(event: PointerEvent): void {
    const origin = this.tap;
    this.tap = null;
    if (!origin || origin.pointerId !== event.pointerId || hasMovedBeyondSlop(origin, event)) return;
    if (event.timeStamp - origin.time > TAP_MAX_MS) return;
    const hit = this.options.pick(event.clientX, event.clientY);
    this.options.onStroke({ phase: "start", hit, shiftKey: origin.shiftKey });
    this.options.onStroke({ phase: "end", hit, shiftKey: origin.shiftKey });
  }

  private readonly handlePointerUp = (event: PointerEvent): void => {
    this.releasePointer(event);
    if (this.pending?.pointerId === event.pointerId) this.beginPendingStroke();
    if (this.stroke?.pointerId === event.pointerId) this.endStroke(event.shiftKey);
    else this.finishTap(event);
    if (event.pointerType !== "touch") this.trackHover(event);
  };

  private readonly handlePointerCancel = (event: PointerEvent): void => {
    this.releasePointer(event);
    const isOwnPointer = this.pending?.pointerId === event.pointerId || this.stroke?.pointerId === event.pointerId;
    if (isOwnPointer || this.tap?.pointerId === event.pointerId) this.cancelEverything();
  };

  private readonly handleLostPointerCapture = (event: PointerEvent): void => {
    this.releasePointer(event);
    if (this.stroke?.pointerId === event.pointerId) this.endStroke(event.shiftKey);
    if (this.pending?.pointerId === event.pointerId) {
      clearTimeout(this.pending.timer);
      this.pending = null;
    }
  };

  private releasePointer(event: PointerEvent): void {
    this.touchIds.delete(event.pointerId);
    if (this.touchIds.size === 0) this.isGestureBlocked = false;
  }

  private readonly handlePointerLeave = (event: PointerEvent): void => {
    if (event.pointerType === "touch" || this.stroke) return;
    this.hoverPoint = null;
    this.cancelHover();
    if (this.lastHoverKey === "none") return;
    this.lastHoverKey = "none";
    this.options.onHover(null);
  };
}
