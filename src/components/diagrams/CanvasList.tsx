"use client";

import { useState } from "react";
import { GitBranch, Plus, Trash2 } from "lucide-react";
import type { Diagram } from "@/types";
import { useAssetMenu } from "@/components/AssetContextMenu";
import { AssetMenuButton, AssetPinButton, PasteButton } from "@/components/AssetMenuButton";
import { ExamplesBar } from "@/components/ExamplesBar";
import { HelpButton } from "@/components/HelpButton";
import { COPY } from "@/copy";
import type { CanvasTemplate } from "@/lib/canvas-shapes/templates";
import { TemplatePicker } from "./TemplatePicker";

interface CanvasListProps {
  projectId: string;
  diagrams: Diagram[];
  onOpen(diagram: Diagram): void;
  onNew(template: CanvasTemplate): void;
  onDelete(id: string): void;
}

/** The Canvas start page: every canvas in the project, with new (from a template), delete and the examples bar. */
export function CanvasList({ projectId, diagrams, onOpen, onNew, onDelete }: CanvasListProps) {
  const { assetTriggerProps, pasteTriggerProps } = useAssetMenu();
  const [isPicking, setIsPicking] = useState(false);
  return (
    <div className="p-6 md:p-10 max-w-3xl mx-auto">
      {isPicking && <TemplatePicker onPick={onNew} onClose={() => setIsPicking(false)} />}
      <div className="flex items-center justify-between gap-3 mb-1">
        <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
          Canvas
        </h1>
        <div className="flex items-center gap-2 shrink-0">
          <HelpButton topic="diagrams" />
          <PasteButton type="diagram" />
          <button
            onClick={() => setIsPicking(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium shrink-0"
            style={{ background: "var(--accent)", color: "white" }}
          >
            <Plus className="w-4 h-4" />
            New canvas
          </button>
        </div>
      </div>
      <p className="text-sm mb-3" style={{ color: "var(--text-secondary)" }}>
        {COPY.canvas.intro}
      </p>
      <ExamplesBar projectId={projectId} collections={["diagrams"]} className="mb-6" />
      {diagrams.length === 0 ? (
        <div {...pasteTriggerProps("diagram")} className="text-center py-20 rounded-xl border border-dashed" style={{ borderColor: "var(--border)" }}>
          <GitBranch className="w-12 h-12 mx-auto mb-4" style={{ color: "var(--text-muted)" }} />
          <p className="text-lg font-medium mb-2" style={{ color: "var(--text-primary)" }}>
            No canvases yet
          </p>
          <p className="text-sm mb-4 px-4" style={{ color: "var(--text-secondary)" }}>
            {COPY.canvas.emptyBody}
          </p>
          <div className="flex justify-center gap-2">
            <button
              onClick={() => setIsPicking(true)}
              className="px-4 py-2 rounded-lg text-sm font-medium"
              style={{ background: "var(--accent)", color: "white" }}
            >
              New canvas
            </button>
          </div>
        </div>
      ) : (
        <div {...pasteTriggerProps("diagram")} className="grid gap-3">
          {diagrams.map((d) => (
            <div
              key={d.id}
              {...assetTriggerProps({ type: "diagram", id: d.id })}
              tabIndex={0}
              onKeyDown={(e) => {
                const trigger = assetTriggerProps({ type: "diagram", id: d.id });
                trigger.onKeyDown(e);
                if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  onOpen(d);
                }
              }}
              className="group flex items-center justify-between p-4 rounded-xl border transition-colors cursor-pointer"
              style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
              onClick={() => onOpen(d)}
              onMouseOver={(e) => { e.currentTarget.style.borderColor = "var(--border-hover)"; }}
              onMouseOut={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
            >
              <div>
                <span className="font-medium" style={{ color: "var(--text-primary)" }}>{d.name}</span>
                <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                  {d.nodes.length} cards · {d.edges.length} lines
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={(e) => { e.stopPropagation(); if (confirm(`Delete "${d.name}"?`)) onDelete(d.id); }}
                  className="p-2 rounded md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                  style={{ color: "var(--red)" }}
                  title="Delete canvas"
                  aria-label={`Delete ${d.name}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <AssetPinButton asset={{ type: "diagram", id: d.id }} label={d.name} />
                <AssetMenuButton asset={{ type: "diagram", id: d.id }} label={d.name} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
