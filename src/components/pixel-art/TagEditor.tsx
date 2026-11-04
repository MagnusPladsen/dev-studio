"use client";

import { useRef } from "react";
import { Check, Trash2 } from "lucide-react";
import type { AnimationDirection, FrameTag } from "@/types";
import { ANIMATION_DIRECTIONS, TAG_COLORS } from "@/lib/sprite-animation";

interface Props {
  tag: FrameTag;
  frameCount: number;
  className?: string;
  /** `commit` is false while the name is being typed; `onCommit` then adds the undo step when the field loses focus. */
  onChange(patch: Partial<FrameTag>, commit: boolean): void;
  onCommit(): void;
  onDelete(): void;
  onClose(): void;
}

const fieldStyle: React.CSSProperties = { background: "var(--bg-primary)", color: "var(--text-primary)", border: "1px solid var(--border)" };

/** One row above the frame strip for the tag being edited: name, frame range, direction and colour. */
export function TagEditor({ tag, frameCount, className = "", onChange, onCommit, onDelete, onClose }: Props) {
  const frameOptions = Array.from({ length: frameCount }, (_, i) => i);
  const nameAtFocus = useRef(tag.name);
  function finishName() {
    if (!tag.name.trim()) onChange({ name: "Tag" }, true);
    else if (tag.name !== nameAtFocus.current) onCommit();
  }
  return (
    <div
      className={`flex items-center gap-2 flex-wrap mb-1.5 px-2 py-1.5 rounded-md text-xs ${className}`}
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-muted)" }}
      role="group"
      aria-label={`Tag ${tag.name}`}
    >
      <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: tag.color }} />
      <input
        type="text"
        value={tag.name}
        onChange={(e) => onChange({ name: e.target.value }, false)}
        onFocus={() => { nameAtFocus.current = tag.name; }}
        onBlur={finishName}
        className="w-28 px-1.5 py-0.5 rounded outline-none"
        style={fieldStyle}
        aria-label="Tag name"
      />
      <label className="flex items-center gap-1">
        Frames
        <select value={tag.from} onChange={(e) => onChange({ from: Number(e.target.value), to: Math.max(tag.to, Number(e.target.value)) }, true)} className="px-1 py-0.5 rounded outline-none" style={fieldStyle} aria-label="First frame">
          {frameOptions.map((i) => <option key={i} value={i}>{i + 1}</option>)}
        </select>
        to
        <select value={tag.to} onChange={(e) => onChange({ to: Number(e.target.value), from: Math.min(tag.from, Number(e.target.value)) }, true)} className="px-1 py-0.5 rounded outline-none" style={fieldStyle} aria-label="Last frame">
          {frameOptions.map((i) => <option key={i} value={i}>{i + 1}</option>)}
        </select>
      </label>
      <select
        value={tag.direction}
        onChange={(e) => onChange({ direction: e.target.value as AnimationDirection }, true)}
        className="px-1 py-0.5 rounded outline-none"
        style={fieldStyle}
        aria-label="Direction"
        title="Which way the tag plays: forward, backward, or there and back"
      >
        {ANIMATION_DIRECTIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
      </select>
      <div className="flex items-center gap-1" role="radiogroup" aria-label="Tag colour">
        {TAG_COLORS.map((color) => (
          <button
            key={color}
            role="radio"
            aria-checked={tag.color === color}
            onClick={() => onChange({ color }, true)}
            className="w-4 h-4 rounded-sm"
            style={{ background: color, outline: tag.color === color ? "2px solid var(--text-primary)" : undefined, outlineOffset: 1 }}
            title={`Colour ${color}`}
            aria-label={`Colour ${color}`}
          />
        ))}
      </div>
      <div className="flex items-center gap-1 ml-auto">
        <button onClick={onDelete} className="flex items-center gap-1 px-2 py-1 rounded-md" style={{ color: "var(--red)", border: "1px solid var(--border)" }} title="Delete this tag (the frames stay)" aria-label="Delete tag">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
        <button onClick={onClose} className="flex items-center gap-1 px-2 py-1 rounded-md" style={{ color: "var(--text-primary)", border: "1px solid var(--border)" }} title="Done editing the tag" aria-label="Done editing the tag">
          <Check className="w-3.5 h-3.5" /> Done
        </button>
      </div>
    </div>
  );
}
