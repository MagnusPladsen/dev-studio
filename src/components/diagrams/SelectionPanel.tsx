"use client";

import { Check, ImagePlus, Link2, Pencil, Rows3, Trash2, Boxes } from "lucide-react";
import type { DiagramNode } from "@/types";
import { CARD_COLORS } from "@/lib/diagrams/cards";
import { LinkedAssets } from "@/components/LinkedAssets";
import { getShape } from "@/lib/canvas-shapes";
import { ArrangeActions, type ArrangeHandlers } from "./ArrangeActions";

interface SelectionPanelProps extends ArrangeHandlers {
  node: DiagramNode;
  projectId: string;
  diagramId: string;
  onColor(color: string | undefined): void;
  onStack(): void;
  onEdit(): void;
  onReplaceImage(): void;
  onChangeAsset(): void;
  onDelete(): void;
}

const BUTTON = "flex items-center gap-1.5 px-2 py-1 rounded text-xs";
const BUTTON_STYLE: React.CSSProperties = { background: "var(--bg-primary)", color: "var(--text-primary)", border: "1px solid var(--border)" };

function Swatches({ nodes, onColor }: { nodes: DiagramNode[]; onColor(color: string | undefined): void }) {
  return (
    <div className="flex flex-wrap gap-1.5 max-md:gap-2" role="group" aria-label="Card colour">
      {CARD_COLORS.map((swatch) => {
        const isActive = nodes.every((node) => node.color === swatch.value);
        return (
          <button
            key={swatch.name}
            onClick={() => onColor(swatch.value)}
            className="w-5 h-5 rounded-full flex items-center justify-center max-md:w-7 max-md:h-7"
            style={{ background: swatch.value ?? "var(--bg-primary)", border: `1px solid ${swatch.value ?? "var(--border-hover)"}` }}
            title={swatch.name}
            aria-label={`${swatch.name} colour`}
            aria-pressed={isActive}
          >
            {isActive && <Check className="w-3 h-3" style={{ color: swatch.value ? "#0a0a0f" : "var(--text-primary)" }} />}
          </button>
        );
      })}
    </div>
  );
}

function TypeActions({ node, onStack, onReplaceImage, onChangeAsset, onEdit }: SelectionPanelProps) {
  if (node.type === "group") {
    return (
      <button onClick={onStack} className={BUTTON} style={BUTTON_STYLE} title="Line up the cards inside this group, top to bottom">
        <Rows3 className="w-3.5 h-3.5" /> Stack as column
      </button>
    );
  }
  if (node.type === "image") {
    return (
      <button onClick={onReplaceImage} className={BUTTON} style={BUTTON_STYLE}>
        <ImagePlus className="w-3.5 h-3.5" /> Replace image
      </button>
    );
  }
  if (node.type === "link") {
    return (
      <button onClick={onEdit} className={BUTTON} style={BUTTON_STYLE}>
        <Link2 className="w-3.5 h-3.5" /> Change link
      </button>
    );
  }
  if (node.type === "asset") {
    return (
      <button onClick={onChangeAsset} className={BUTTON} style={BUTTON_STYLE}>
        <Boxes className="w-3.5 h-3.5" /> Change asset
      </button>
    );
  }
  return null;
}

function PanelFrame({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-card-control=""
      className="absolute top-3 right-3 z-10 w-64 p-3 rounded-xl border space-y-2.5 max-md:top-auto max-md:bottom-3 max-md:left-3 max-md:right-3 max-md:w-auto"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      {children}
    </div>
  );
}

function DeleteButton({ onDelete, label }: { onDelete(): void; label: string }) {
  return (
    <button onClick={onDelete} className="p-1 rounded max-md:p-2" style={{ color: "var(--red)" }} title="Delete (Del)" aria-label={label}>
      <Trash2 className="w-3.5 h-3.5" />
    </button>
  );
}

/** Floating panel for the selected card: colour, links to other assets, arranging and the card's own actions. */
export function SelectionPanel(props: SelectionPanelProps) {
  const { node, onEdit, onDelete } = props;
  const shape = getShape(node.type);
  return (
    <PanelFrame>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium truncate" style={{ color: "var(--text-primary)" }}>
          {shape.label}{node.label ? `: ${node.label.split("\n")[0]}` : ""}
        </span>
        <div className="flex items-center gap-0.5 shrink-0">
          {shape.canEditText && (
            <button onClick={onEdit} className="p-1 rounded max-md:p-2" style={{ color: "var(--text-primary)" }} title="Edit text (double-click)" aria-label="Edit text">
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
          <DeleteButton onDelete={onDelete} label="Delete card" />
        </div>
      </div>
      <Swatches nodes={[node]} onColor={props.onColor} />
      <ArrangeActions count={1} {...props} />
      <TypeActions {...props} />
      <LinkedAssets projectId={props.projectId} type="diagram" id={props.diagramId} elementId={node.id} isInFloatingPanel />

    </PanelFrame>
  );
}

/** Floating panel for several selected cards: recolour, duplicate, delete, arrange, align and distribute. */
export function MultiSelectionPanel(props: ArrangeHandlers & { nodes: DiagramNode[]; onColor(color: string | undefined): void; onDelete(): void }) {
  const { nodes, onColor, onDelete } = props;
  return (
    <PanelFrame>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>
          {nodes.length} cards selected
        </span>
        <DeleteButton onDelete={onDelete} label="Delete selected cards" />
      </div>
      <Swatches nodes={nodes} onColor={onColor} />
      <ArrangeActions count={nodes.length} {...props} />
    </PanelFrame>
  );
}
