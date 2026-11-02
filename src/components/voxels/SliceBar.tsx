"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { SLICE_AXES, type SliceAxis } from "@/lib/voxels/slice";

interface Props {
  axis: SliceAxis;
  onAxisChange(axis: SliceAxis): void;
  layer: number;
  layerCount: number;
  onLayerChange(layer: number): void;
  showBelow: boolean;
  onShowBelowChange(show: boolean): void;
  selectAllLayers: boolean;
  onSelectAllLayersChange(all: boolean): void;
  isSelectTool: boolean;
}

const btn: React.CSSProperties = { color: "var(--text-primary)", border: "1px solid var(--border)" };

/** Slice view controls: which way to slice, which layer, and the faint layer below. */
export function SliceBar(props: Props): React.JSX.Element {
  const { axis, layer, layerCount, onLayerChange } = props;
  const layerName = SLICE_AXES.find((a) => a.axis === axis)?.layerName ?? "Layer";
  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 border-b shrink-0 overflow-x-auto text-xs"
      style={{ borderColor: "var(--border)", background: "var(--bg-secondary)", color: "var(--text-secondary)" }}
    >
      <div className="flex items-center rounded-md p-0.5 shrink-0" style={{ border: "1px solid var(--border)" }} role="radiogroup" aria-label="Slice direction">
        {SLICE_AXES.map(({ axis: value, label }) => (
          <button
            key={value}
            role="radio"
            aria-checked={axis === value}
            onClick={() => props.onAxisChange(value)}
            className="px-2 py-0.5 rounded"
            style={{
              background: axis === value ? "var(--accent)" : "transparent",
              color: axis === value ? "var(--on-accent, #fff)" : "var(--text-primary)",
            }}
            title={`Look at the model from the ${label.toLowerCase()} and edit one layer at a time`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => onLayerChange(Math.max(0, layer - 1))}
          disabled={layer <= 0}
          className="p-1 rounded-md disabled:opacity-30"
          style={btn}
          title="Previous layer ( [ )"
          aria-label="Previous layer"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        <input
          type="range"
          min={0}
          max={layerCount - 1}
          value={layer}
          onChange={(e) => onLayerChange(Number(e.target.value))}
          className="w-28 max-md:w-20 accent-[var(--accent)]"
          aria-label={`${layerName} layer`}
        />
        <button
          onClick={() => onLayerChange(Math.min(layerCount - 1, layer + 1))}
          disabled={layer >= layerCount - 1}
          className="p-1 rounded-md disabled:opacity-30"
          style={btn}
          title="Next layer ( ] )"
          aria-label="Next layer"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
        <span className="tabular-nums whitespace-nowrap" style={{ color: "var(--text-primary)" }}>
          {layerName} {layer + 1} / {layerCount}
        </span>
      </div>
      <label className="flex items-center gap-1.5 shrink-0 whitespace-nowrap" title="Show the layer underneath faintly, to line up the next one">
        <input type="checkbox" checked={props.showBelow} onChange={(e) => props.onShowBelowChange(e.target.checked)} className="accent-[var(--accent)]" />
        Show layer below
      </label>
      {props.isSelectTool && (
        <label className="flex items-center gap-1.5 shrink-0 whitespace-nowrap" title="Select through every layer instead of only this one">
          <input type="checkbox" checked={props.selectAllLayers} onChange={(e) => props.onSelectAllLayersChange(e.target.checked)} className="accent-[var(--accent)]" />
          Select all layers
        </label>
      )}
    </div>
  );
}
