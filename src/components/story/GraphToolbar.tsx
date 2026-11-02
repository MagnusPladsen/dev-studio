"use client";

import { useState } from "react";
import { Boxes, Maximize2, Minus, Network, Plus, Search, X } from "lucide-react";
import { searchNodes, type GraphNode } from "@/lib/story-graph";

interface GraphSearchProps {
  nodes: GraphNode[];
  onPick(node: GraphNode): void;
  onClear(): void;
}

function GraphSearch({ nodes, onPick, onClear }: GraphSearchProps): React.JSX.Element {
  const [query, setQuery] = useState("");
  const matches = searchNodes(nodes, query);
  const pick = (node: GraphNode): void => {
    setQuery("");
    onPick(node);
  };
  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Enter" && matches[0]) pick(matches[0]);
    if (event.key === "Escape") {
      setQuery("");
      onClear();
    }
  };
  return (
    <div className="relative flex-1 min-w-0 max-w-xs">
      <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: "var(--text-muted)" }} />
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Find in graph…"
        aria-label="Find a node in the graph"
        className="w-full pl-7 pr-2 py-1.5 rounded-md text-xs outline-none"
        style={{ background: "var(--bg-primary)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
      />
      {matches.length > 0 && <SearchResults matches={matches} onPick={pick} />}
    </div>
  );
}

function SearchResults({ matches, onPick }: { matches: GraphNode[]; onPick(node: GraphNode): void }): React.JSX.Element {
  return (
    <ul className="absolute z-20 left-0 right-0 mt-1 rounded-md py-1 shadow-lg" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      {matches.map((node) => (
        <li key={node.key}>
          <button onClick={() => onPick(node)} className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-left hover:bg-[var(--bg-hover)]" style={{ color: "var(--text-primary)" }}>
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: node.color }} />
            <span className="truncate flex-1">{node.title}</span>
            <span className="shrink-0" style={{ color: "var(--text-muted)" }}>
              {node.label}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

interface GraphHeaderProps extends GraphSearchProps {
  showAssets: boolean;
  onToggleAssets(): void;
  onClose(): void;
}

export function GraphHeader({ showAssets, onToggleAssets, onClose, ...search }: GraphHeaderProps): React.JSX.Element {
  return (
    <div className="h-12 flex items-center gap-2 px-4 max-md:px-3 border-b shrink-0" style={{ borderColor: "var(--border)" }}>
      <Network className="w-4 h-4 shrink-0 max-md:hidden" style={{ color: "var(--accent)" }} />
      <h2 className="font-semibold text-sm mr-2 shrink-0 max-md:hidden" style={{ color: "var(--text-primary)" }}>
        Connection Graph
      </h2>
      <GraphSearch {...search} />
      <div className="flex-1 max-md:hidden" />
      <button
        onClick={onToggleAssets}
        aria-pressed={showAssets}
        title={showAssets ? "Hide linked assets" : "Show linked assets"}
        className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs shrink-0"
        style={{
          color: showAssets ? "var(--on-accent)" : "var(--text-primary)",
          background: showAssets ? "var(--accent)" : "var(--bg-primary)",
          border: "1px solid var(--border)",
        }}
      >
        <Boxes className="w-3.5 h-3.5" />
        <span className="max-md:hidden">Linked assets</span>
        <span className="md:hidden">Assets</span>
      </button>
      <button onClick={onClose} className="p-1.5 rounded-lg shrink-0" style={{ color: "var(--text-secondary)" }} title="Close graph" aria-label="Close graph">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

interface ZoomControlsProps {
  onZoomIn(): void;
  onZoomOut(): void;
  onFit(): void;
}

export function ZoomControls({ onZoomIn, onZoomOut, onFit }: ZoomControlsProps): React.JSX.Element {
  const buttons = [
    { label: "Zoom in", icon: Plus, onClick: onZoomIn },
    { label: "Zoom out", icon: Minus, onClick: onZoomOut },
    { label: "Fit graph to screen", icon: Maximize2, onClick: onFit },
  ];
  return (
    <div className="absolute right-3 bottom-3 flex flex-col rounded-lg overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      {buttons.map(({ label, icon: Icon, onClick }) => (
        <button key={label} onClick={onClick} title={label} aria-label={label} className="p-2 max-md:p-2.5 hover:bg-[var(--bg-hover)]" style={{ color: "var(--text-primary)" }}>
          <Icon className="w-4 h-4" />
        </button>
      ))}
    </div>
  );
}
