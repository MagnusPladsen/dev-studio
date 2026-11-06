"use client";

import { useEffect, useRef, useState } from "react";
import { MIN_KEPT } from "@/lib/audio/sfx-finish";
import type { SfxFinish } from "@/types";

const WIDTH = 600;
const HEIGHT = 120;
/** How close (in screen pixels) a press must be to a trim handle to grab it. */
const GRAB_DISTANCE = 20;

type Handle = "start" | "end";

/** Draws min/max per column, so fast waves show as a filled band instead of a single wobbly line. */
function drawPeaks(ctx: CanvasRenderingContext2D, samples: Float32Array, from: number, to: number) {
  const columns = Math.max(1, Math.round(to - from));
  ctx.beginPath();
  for (let column = 0; column < columns; column++) {
    const first = Math.floor((column / columns) * samples.length);
    const last = Math.max(first + 1, Math.floor(((column + 1) / columns) * samples.length));
    let low = 0;
    let high = 0;
    for (let i = first; i < last && i < samples.length; i++) {
      low = Math.min(low, samples[i]);
      high = Math.max(high, samples[i]);
    }
    const x = from + column + 0.5;
    ctx.moveTo(x, ((1 - Math.min(1, high)) * HEIGHT) / 2);
    ctx.lineTo(x, ((1 - Math.max(-1, low)) * HEIGHT) / 2 + 1);
  }
  ctx.stroke();
}

function drawWaveform(canvas: HTMLCanvasElement, untrimmed: Float32Array, finished: Float32Array, finish: SfxFinish) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const color = getComputedStyle(canvas).getPropertyValue("--tool-color").trim() || "#fbbf24";
  const keptFrom = finish.trimStart * WIDTH;
  const keptTo = (1 - finish.trimEnd) * WIDTH;

  ctx.fillStyle = "rgba(10,10,15,1)";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.strokeStyle = "rgba(42,42,58,0.5)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, HEIGHT / 2);
  ctx.lineTo(WIDTH, HEIGHT / 2);
  ctx.stroke();
  if (untrimmed.length === 0) return;

  ctx.strokeStyle = "rgba(140,140,160,0.35)";
  drawPeaks(ctx, untrimmed, 0, WIDTH);
  ctx.fillStyle = "rgba(10,10,15,0.85)";
  ctx.fillRect(keptFrom, 0, keptTo - keptFrom, HEIGHT);
  ctx.strokeStyle = color;
  drawPeaks(ctx, finished, keptFrom, keptTo);

  ctx.fillStyle = color;
  for (const x of [Math.max(1, keptFrom), Math.min(WIDTH - 1, keptTo)]) {
    ctx.fillRect(x - 1, 0, 2, HEIGHT);
    ctx.fillRect(x - 4, 0, 8, 14);
  }
}

/**
 * The sound's waveform with two trim handles. The kept part shows the finished sound;
 * the trimmed parts are greyed out. Dragging a handle calls `onTrim`, letting go calls `onTrimDone`.
 */
export function SfxWaveform({
  untrimmed,
  finished,
  finish,
  onTrim,
  onTrimDone,
}: {
  untrimmed: Float32Array;
  finished: Float32Array;
  finish: SfxFinish;
  onTrim: (trimStart: number, trimEnd: number) => void;
  onTrimDone: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dragging, setDragging] = useState<Handle | null>(null);
  const [hovering, setHovering] = useState(false);

  useEffect(() => {
    if (canvasRef.current) drawWaveform(canvasRef.current, untrimmed, finished, finish);
  }, [untrimmed, finished, finish]);

  function shareAt(clientX: number): number {
    const rect = canvasRef.current!.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  }

  function handleNear(clientX: number): Handle | null {
    const width = canvasRef.current!.getBoundingClientRect().width;
    const share = shareAt(clientX);
    const toStart = Math.abs(share - finish.trimStart) * width;
    const toEnd = Math.abs(share - (1 - finish.trimEnd)) * width;
    if (Math.min(toStart, toEnd) > GRAB_DISTANCE) return null;
    return toStart <= toEnd ? "start" : "end";
  }

  function moveHandle(handle: Handle, share: number) {
    if (handle === "start") onTrim(Math.min(share, 1 - MIN_KEPT - finish.trimEnd), finish.trimEnd);
    else onTrim(finish.trimStart, Math.min(1 - share, 1 - MIN_KEPT - finish.trimStart));
  }

  return (
    <canvas
      ref={canvasRef}
      width={WIDTH}
      height={HEIGHT}
      role="img"
      aria-label="Waveform. Drag the handles at either end to trim the sound."
      style={{ width: "100%", height: `${HEIGHT}px`, borderRadius: "8px", touchAction: "pan-y", cursor: hovering || dragging ? "ew-resize" : "default" }}
      onPointerDown={(e) => {
        const handle = handleNear(e.clientX);
        if (!handle) return;
        setDragging(handle);
        e.currentTarget.setPointerCapture(e.pointerId);
        moveHandle(handle, shareAt(e.clientX));
      }}
      onPointerMove={(e) => {
        if (dragging) moveHandle(dragging, shareAt(e.clientX));
        else setHovering(handleNear(e.clientX) !== null);
      }}
      onPointerUp={() => {
        if (!dragging) return;
        setDragging(null);
        onTrimDone();
      }}
      onPointerCancel={() => setDragging(null)}
      onPointerLeave={() => setHovering(false)}
    />
  );
}
