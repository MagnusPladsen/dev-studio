"use client";

import { MAX_FRAME_MS, MIN_FRAME_MS } from "@/lib/sprite-animation";

interface Props {
  /** The selected frames' duration, or null when they differ. */
  duration: number | null;
  frameCount: number;
  onCommit(ms: number): void;
}

/**
 * How long the selected frames show, in ms. Applies on Enter or when the field loses focus, so typing "150" never
 * passes through "1". Re-mount it (via `key`) when the selection or its duration changes.
 */
export function FrameDurationInput({ duration, frameCount, onCommit }: Props) {
  function commit(input: HTMLInputElement) {
    const ms = Number(input.value);
    if (input.value.trim() === "" || !Number.isFinite(ms) || ms === duration) return;
    onCommit(ms);
  }

  const subject = frameCount === 1 ? "this frame" : `the ${frameCount} selected frames`;
  return (
    <label className="flex items-center gap-1 text-xs" style={{ color: "var(--text-muted)" }} title={`How long ${subject} show, in milliseconds`}>
      {frameCount === 1 ? "Frame" : `${frameCount} frames`}
      <input
        type="number"
        min={MIN_FRAME_MS}
        max={MAX_FRAME_MS}
        step={10}
        defaultValue={duration ?? ""}
        placeholder="mixed"
        onBlur={(e) => commit(e.currentTarget)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit(e.currentTarget);
        }}
        className="w-16 text-xs px-1 py-0.5 rounded outline-none text-center"
        style={{ background: "var(--bg-primary)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
        aria-label={`Duration of ${subject} in milliseconds`}
      />
      ms
    </label>
  );
}
