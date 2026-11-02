"use client";

import Link from "next/link";
import { Check, ExternalLink, ImagePlus, Link2, Pencil, Rows3, Trash2, Boxes } from "lucide-react";
import type { DiagramNode } from "@/types";
import { ASSET_KINDS, ASSET_TYPES, assetHref, getAsset, listAssets } from "@/lib/assets";
import { CARD_COLORS, NODE_LABELS, hasShapeBody, nodeAsset } from "@/lib/diagrams/cards";
import { ArrangeActions, type ArrangeHandlers } from "./ArrangeActions";

interface SelectionPanelProps extends ArrangeHandlers {
  node: DiagramNode;
  projectId: string;
  onColor(color: string | undefined): void;
  onLinkAsset(value: string): void;
  onStack(): void;
  onEdit(): void;
  onReplaceImage(): void;
  onChangeAsset(): void;
  onDelete(): void;
}

const BUTTON = "flex items-center gap-1.5 px-2 py-1 rounded text-xs";
const BUTTON_STYLE: React.CSSProperties = { background: "var(--bg-primary)", color: "var(--text-primary)", border: "1px solid var(--border)" };

function canLinkAsset(node: DiagramNode): boolean {
  return hasShapeBody(node.type) || node.type === "note" || node.type === "checklist";
}

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

function AssetSelect({ node, projectId, onLinkAsset }: Pick<SelectionPanelProps, "node" | "projectId" | "onLinkAsset">) {
  const asset = nodeAsset(node);
  const assetName = asset ? getAsset(projectId, asset.type, asset.id)?.name : undefined;
  const projectAssets = listAssets(projectId);
  return (
    <>
      <label className="block text-xs" style={{ color: "var(--text-secondary)" }}>
        Linked asset
        <select
          value={asset ? `${asset.type}:${asset.id}` : ""}
          onChange={(e) => onLinkAsset(e.target.value)}
          className="mt-1 w-full px-2 py-1 rounded text-xs outline-none"
          style={{ background: "var(--bg-primary)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
        >
          <option value="">None</option>
          {ASSET_TYPES.map((type) => {
            const group = projectAssets.filter((a) => a.type === type);
            if (!group.length) return null;
            return (
              <optgroup key={type} label={ASSET_KINDS[type].label}>
                {group.map((a) => (
                  <option key={a.id} value={`${a.type}:${a.id}`}>{a.name}</option>
                ))}
              </optgroup>
            );
          })}
        </select>
      </label>
      {asset && (assetName ? (
        <Link href={assetHref(projectId, asset.type, asset.id)} className="flex items-center gap-1 text-xs hover:underline" style={{ color: "var(--accent)" }}>
          <ExternalLink className="w-3 h-3" />
          Open {assetName}
        </Link>
      ) : (
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>Linked asset was deleted</span>
      ))}
    </>
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

/** Floating panel for the selected card: colour, linked asset, arranging and the card's own actions. */
export function SelectionPanel(props: SelectionPanelProps) {
  const { node, onEdit, onDelete } = props;
  const canEditText = node.type !== "asset" && node.type !== "link" && node.type !== "drawing";
  return (
    <PanelFrame>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium truncate" style={{ color: "var(--text-primary)" }}>
          {NODE_LABELS[node.type]}{node.label ? `: ${node.label.split("\n")[0]}` : ""}
        </span>
        <div className="flex items-center gap-0.5 shrink-0">
          {canEditText && (
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
      {canLinkAsset(node) && <AssetSelect {...props} />}
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
