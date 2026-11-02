"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { BookOpen } from "lucide-react";
import type { MenuTriggerProps } from "@/components/AssetContextMenu";
import { ASSET_KINDS } from "@/lib/assets";
import { getRelated } from "@/lib/links";
import { buildStoryGraph, neighbourMap, type GraphEntry, type GraphNode, type StoryGraph as Graph } from "@/lib/story-graph";
import type { AssetType } from "@/types";
import { GraphScene, type Highlight } from "./GraphScene";
import { GraphHeader, ZoomControls } from "./GraphToolbar";
import { useGraphGestures } from "./useGraphGestures";
import { useGraphLayout } from "./useGraphLayout";
import { useGraphViewport } from "./useGraphViewport";

const ZOOM_STEP = 1.3;

export interface StoryGraphProps {
  projectId: string;
  entries: GraphEntry[];
  typeMeta(entryType: string): { color: string; label: string };
  onOpen(node: GraphNode): void;
  menuProps(node: GraphNode): MenuTriggerProps;
  onClose(): void;
}

function assetMeta(type: AssetType): { color: string; label: string } {
  return { color: ASSET_KINDS[type].color, label: ASSET_KINDS[type].label };
}

function useStoryGraphData(projectId: string, entries: GraphEntry[], typeMeta: StoryGraphProps["typeMeta"], includeAssets: boolean): Graph {
  return useMemo(
    () => buildStoryGraph({ entries, relatedOf: (id) => getRelated(projectId, "story", id), typeMeta, assetMeta, includeAssets }),
    [projectId, entries, typeMeta, includeAssets]
  );
}

function useHighlight(graph: Graph, hoverKey: string | null, focusKey: string | null): Highlight {
  const neighbours = useMemo(() => neighbourMap(graph.edges), [graph]);
  const activeKey = hoverKey ?? focusKey;
  return { activeKey, focusKey, neighbours: (activeKey && neighbours.get(activeKey)) || new Set<string>() };
}

function GraphLegend({ nodes }: { nodes: GraphNode[] }): React.JSX.Element {
  const kinds = [...new Map(nodes.map((node) => [node.label, node])).values()];
  return (
    <ul className="absolute left-3 bottom-3 max-w-[calc(100%-5rem)] flex flex-wrap gap-x-3 gap-y-1 pointer-events-none text-[11px]" style={{ color: "var(--text-secondary)" }}>
      {kinds.map((node) => (
        <li key={node.label} className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${node.kind === "asset" ? "border-2" : ""}`} style={node.kind === "asset" ? { borderColor: node.color } : { background: node.color }} />
          {node.label}
        </li>
      ))}
    </ul>
  );
}

function EmptyGraph(): React.JSX.Element {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-2 p-6 text-center">
      <BookOpen className="w-8 h-8" style={{ color: "var(--text-muted)" }} />
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        No story entries yet.
      </p>
      <p className="text-xs max-w-xs" style={{ color: "var(--text-muted)" }}>
        Create entries and link them with [[wiki links]] or linked assets to see how your world connects.
      </p>
    </div>
  );
}

export function StoryGraph(props: StoryGraphProps): React.JSX.Element {
  const [showAssets, setShowAssets] = useState(true);
  const graph = useStoryGraphData(props.projectId, props.entries, props.typeMeta, showAssets);
  return (
    <div className="h-full flex flex-col min-w-0" style={{ background: "var(--bg-primary)" }}>
      {props.entries.length === 0 ? (
        <>
          <GraphHeader nodes={[]} onPick={() => undefined} onClear={() => undefined} showAssets={showAssets} onToggleAssets={() => setShowAssets((v) => !v)} onClose={props.onClose} />
          <EmptyGraph />
        </>
      ) : (
        <GraphView {...props} graph={graph} showAssets={showAssets} onToggleAssets={() => setShowAssets((v) => !v)} />
      )}
    </div>
  );
}

interface GraphViewProps extends StoryGraphProps {
  graph: Graph;
  showAssets: boolean;
  onToggleAssets(): void;
}

function GraphView({ graph, showAssets, onToggleAssets, onOpen, menuProps, onClose }: GraphViewProps): React.JSX.Element {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const layout = useGraphLayout(graph);
  const getCircles = useCallback(() => layout.simulation.nodes, [layout]);
  const viewport = useGraphViewport(svgRef, getCircles);
  const gestures = useGraphGestures({ svgRef, viewport, layout, onBackgroundTap: () => setFocusKey(null) });
  const highlight = useHighlight(graph, hoverKey, focusKey);
  const focusNode = (node: GraphNode): void => {
    setFocusKey(node.key);
    const position = layout.simulation.nodes.find((n) => n.key === node.key);
    if (position) viewport.focus(position);
  };
  return (
    <>
      <GraphHeader nodes={graph.nodes} onPick={focusNode} onClear={() => setFocusKey(null)} showAssets={showAssets} onToggleAssets={onToggleAssets} onClose={onClose} />
      <div className="relative flex-1 min-h-0 overflow-hidden">
        <GraphScene svgRef={svgRef} nodes={graph.nodes} edges={graph.edges} positions={layout.simulation.nodes} camera={viewport.camera} highlight={highlight} gestures={gestures} onOpen={onOpen} onHover={setHoverKey} menuProps={menuProps} />
        <GraphLegend nodes={graph.nodes} />
        <ZoomControls onZoomIn={() => viewport.zoomBy(ZOOM_STEP)} onZoomOut={() => viewport.zoomBy(1 / ZOOM_STEP)} onFit={viewport.fit} />
      </div>
    </>
  );
}
