"use client";

import { ArrowRight, Maximize, ZoomIn, ZoomOut } from "lucide-react";
import type { Diagram } from "@/types";
import type { History } from "@/hooks/useHistory";
import type { SaveState } from "@/hooks/useAutosave";
import { UndoRedoButtons } from "@/components/UndoRedoButtons";
import { SaveIndicator } from "@/components/SaveIndicator";
import { ExportMenu } from "@/components/ExportMenu";
import { HelpButton } from "@/components/HelpButton";
import { LinkedAssets } from "@/components/LinkedAssets";
import type { NodeType } from "@/lib/diagrams/cards";
import { AddCardMenu } from "./AddCardMenu";
import { ToolPicker, type BoardTool } from "./ToolPicker";

interface CanvasToolbarProps {
  projectId: string;
  diagram: Diagram | null;
  /** The canvas is saved already, so linked assets can point at it. */
  isSaved: boolean;
  history: History;
  saveState: SaveState;
  tool: BoardTool;
  hasSelectedEdge: boolean;
  onBack(): void;
  onRename(name: string): void;
  onTool(tool: BoardTool): void;
  onAdd(type: NodeType): void;
  onToggleEdgeType(): void;
  onZoomIn(): void;
  onZoomOut(): void;
  onFit(): void;
  onExportPng(): void;
  onExportSvg(): void;
  onExportJson(): void;
}

/** The editor's top bar: back, undo and name on the left; tools, add, zoom, save state and export on the right. */
export function CanvasToolbar(props: CanvasToolbarProps) {
  const { diagram } = props;
  return (
    <div
      className="flex items-center justify-between flex-wrap md:gap-x-3 gap-y-1.5 px-3 min-h-12 py-1.5 border-b shrink-0"
      style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}
    >
      <div className="flex items-center gap-1 min-w-0 md:shrink-0">
        <button onClick={props.onBack} className="px-2 py-1 rounded text-xs whitespace-nowrap" style={{ color: "var(--text-primary)" }}>
          ← All canvases
        </button>
        <UndoRedoButtons history={props.history} />
        <input
          className="bg-transparent text-sm font-medium outline-none px-2 py-1 rounded min-w-0 max-w-[40vw] md:max-w-xs"
          style={{ color: "var(--text-primary)", width: `${Math.max(10, (diagram?.name || "").length + 2)}ch` }}
          value={diagram?.name || ""}
          onChange={(e) => props.onRename(e.target.value)}
          aria-label="Canvas name"
          title={diagram?.name}
        />
        {diagram && (
          <div className="ml-2 hidden md:block">
            <LinkedAssets projectId={props.projectId} type="diagram" id={props.isSaved ? diagram.id : null} layout="row" maxRowChips={0} />
          </div>
        )}
      </div>
      <div className="flex items-center gap-1 max-md:flex-wrap">
        <ToolPicker tool={props.tool} onChange={props.onTool} />

        <div className="w-px h-5 mx-0.5 lg:mx-1" style={{ background: "var(--border)" }} />

        <AddCardMenu onPick={props.onAdd} />

        {props.hasSelectedEdge && (
          <button
            onClick={props.onToggleEdgeType}
            className="px-2 py-1 rounded text-xs"
            style={{ color: "var(--text-secondary)", background: "var(--bg-card)", border: "1px solid var(--border)" }}
            title="Change line style (arrow, dashed, plain)"
            aria-label="Change line style"
          >
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}

        <div className="w-px h-5 mx-0.5 lg:mx-1" style={{ background: "var(--border)" }} />

        <button onClick={props.onZoomIn} className="p-1.5 rounded" style={{ color: "var(--text-secondary)" }} title="Zoom in" aria-label="Zoom in">
          <ZoomIn className="w-4 h-4" />
        </button>
        <button onClick={props.onZoomOut} className="p-1.5 rounded" style={{ color: "var(--text-secondary)" }} title="Zoom out" aria-label="Zoom out">
          <ZoomOut className="w-4 h-4" />
        </button>
        <button onClick={props.onFit} className="p-1.5 rounded" style={{ color: "var(--text-secondary)" }} title="Fit all cards in view" aria-label="Fit all cards in view">
          <Maximize className="w-4 h-4" />
        </button>

        <div className="w-px h-5 mx-0.5 lg:mx-1" style={{ background: "var(--border)" }} />

        <SaveIndicator state={props.saveState} className="px-1" />
        <HelpButton topic="diagrams" />
        <ExportMenu
          items={[
            { label: "PNG image", description: "The whole board as a picture", onClick: props.onExportPng },
            { label: "SVG image", description: "Sharp vector picture for docs and design tools", onClick: props.onExportSvg },
            { label: "JSON", description: "Cards and lines, to re-import or use in code", onClick: props.onExportJson },
          ]}
        />
      </div>
    </div>
  );
}
