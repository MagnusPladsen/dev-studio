"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import type { AssetRef, AssetType, Diagram } from "@/types";
import { ASSET_KINDS, ASSET_TYPES, listAssets, type AssetSummary } from "@/lib/assets";
import { elementName } from "@/lib/diagrams/elements";
import { getShape } from "@/lib/canvas-shapes";
import { refKey } from "@/lib/links";
import { storage } from "@/lib/storage";

export interface AssetPickerListProps {
  projectId: string;
  /** Only these kinds are offered; every kind when left out. */
  types?: AssetType[];
  /** Refs already taken: a whole asset, or one canvas element. */
  exclude: AssetRef[];
  /** Assets left out altogether, elements included (e.g. the canvas the pick is made from). */
  hiddenIds?: string[];
  /** Picking a canvas opens a second step that offers the whole canvas or one of its elements. */
  allowElements?: boolean;
  /** Shown above the list, e.g. a "New canvas" button. */
  header?: React.ReactNode;
  onPick(ref: AssetRef): void;
  onEscape?(): void;
}

const ROW = "w-full flex items-center gap-2 px-2 py-1 rounded text-xs text-left hover:bg-[var(--bg-hover)] focus-visible:bg-[var(--bg-hover)] focus-visible:outline-none max-md:py-2";

export function AssetThumb({ asset }: { asset: AssetSummary }): React.JSX.Element {
  if (asset.thumbnail) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={asset.thumbnail} alt="" className="w-4 h-4 shrink-0" style={{ imageRendering: "pixelated" }} />;
  }
  return <span className="w-2 h-2 rounded-full shrink-0" style={{ background: ASSET_KINDS[asset.type].color }} />;
}

function matches(text: string, query: string): boolean {
  const search = query.trim().toLowerCase();
  return !search || text.toLowerCase().includes(search);
}

function SearchField({ value, placeholder, onChange, onEscape }: { value: string; placeholder: string; onChange(value: string): void; onEscape?(): void }) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 mb-1.5 rounded" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}>
      <Search className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} />
      <input
        autoFocus
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Escape" || !onEscape) return;
          event.stopPropagation();
          onEscape();
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        className="flex-1 bg-transparent text-xs outline-none"
        style={{ color: "var(--text-primary)" }}
      />
    </div>
  );
}

function AssetGroups(props: { candidates: AssetSummary[]; allowElements?: boolean; onPick(asset: AssetSummary): void }) {
  return (
    <>
      {ASSET_TYPES.map((type) => {
        const group = props.candidates.filter((candidate) => candidate.type === type);
        if (!group.length) return null;
        const opensElements = props.allowElements && type === "diagram";
        return (
          <div key={type} className="mb-1">
            <div className="text-[10px] uppercase tracking-wide px-2 py-1" style={{ color: ASSET_KINDS[type].color }}>
              {ASSET_KINDS[type].label}
            </div>
            {group.map((candidate) => (
              <button key={candidate.id} type="button" onClick={() => props.onPick(candidate)} className={ROW} style={{ color: "var(--text-primary)" }}>
                <AssetThumb asset={candidate} />
                <span className="truncate flex-1">{candidate.name}</span>
                {opensElements && <ChevronRight className="w-3 h-3 shrink-0" style={{ color: "var(--text-muted)" }} aria-hidden="true" />}
              </button>
            ))}
          </div>
        );
      })}
    </>
  );
}

interface ElementStepProps {
  canvas: AssetSummary;
  query: string;
  exclude: Set<string>;
  onBack(): void;
  onPick(ref: AssetRef): void;
  projectId: string;
}

function ElementStep({ canvas, query, exclude, onBack, onPick, projectId }: ElementStepProps) {
  const diagram = storage.getById("diagrams", canvas.id, projectId) as Diagram | undefined;
  const whole: AssetRef = { type: "diagram", id: canvas.id };
  const elements = (diagram?.nodes ?? [])
    .map((node) => ({ node, name: elementName(node) }))
    .filter(({ node, name }) => matches(name, query) && !exclude.has(refKey({ ...whole, elementId: node.id })))
    .sort((a, b) => a.name.localeCompare(b.name));
  const isWholeShown = !exclude.has(refKey(whole)) && matches(canvas.name, query);
  return (
    <>
      <button type="button" onClick={onBack} className={ROW} style={{ color: "var(--text-secondary)" }}>
        <ChevronLeft className="w-3.5 h-3.5" />
        <span className="truncate">{canvas.name}</span>
      </button>
      {isWholeShown && (
        <button type="button" onClick={() => onPick(whole)} className={ROW} style={{ color: "var(--text-primary)" }}>
          <AssetThumb asset={canvas} />
          <span className="truncate font-medium">Whole canvas</span>
        </button>
      )}
      <div className="text-[10px] uppercase tracking-wide px-2 py-1" style={{ color: ASSET_KINDS.diagram.color }}>
        Elements
      </div>
      {elements.length === 0 && (
        <p className="text-xs px-2 py-2" style={{ color: "var(--text-muted)" }}>
          No elements to pick.
        </p>
      )}
      {elements.map(({ node, name }) => (
        <button key={node.id} type="button" onClick={() => onPick({ ...whole, elementId: node.id })} className={ROW} style={{ color: "var(--text-primary)" }}>
          <span className="truncate flex-1">{name}</span>
          <span className="shrink-0" style={{ color: "var(--text-muted)" }}>{getShape(node.type).label}</span>
        </button>
      ))}
    </>
  );
}

/** Searchable asset list grouped by kind; with `allowElements` a canvas opens onto its elements. */
export function AssetPickerList({ projectId, types, exclude, hiddenIds = [], allowElements, header, onPick, onEscape }: AssetPickerListProps): React.JSX.Element {
  const [query, setQuery] = useState("");
  const [canvas, setCanvas] = useState<AssetSummary | null>(null);
  const excluded = new Set(exclude.map(refKey));
  const hidden = new Set(hiddenIds);
  const candidates = listAssets(projectId).filter(
    (asset) =>
      (!types || types.includes(asset.type)) &&
      !hidden.has(asset.id) &&
      (!excluded.has(refKey(asset)) || (allowElements && asset.type === "diagram")) &&
      matches(asset.name, query),
  );
  const pickAsset = (asset: AssetSummary): void => {
    if (!allowElements || asset.type !== "diagram") return onPick({ type: asset.type, id: asset.id });
    setCanvas(asset);
    setQuery("");
  };

  return (
    <>
      <SearchField
        value={query}
        onChange={setQuery}
        onEscape={onEscape}
        placeholder={canvas ? `Search elements in ${canvas.name}` : "Search assets in this project"}
      />
      <div className="min-h-0 overflow-y-auto">
        {!canvas && header}
        {canvas ? (
          <ElementStep canvas={canvas} query={query} exclude={excluded} projectId={projectId} onBack={() => setCanvas(null)} onPick={onPick} />
        ) : (
          <>
            {candidates.length === 0 && (
              <p className="text-xs px-2 py-3 text-center" style={{ color: "var(--text-muted)" }}>
                Nothing to pick yet.
              </p>
            )}
            <AssetGroups candidates={candidates} allowElements={allowElements} onPick={pickAsset} />
          </>
        )}
      </div>
    </>
  );
}
