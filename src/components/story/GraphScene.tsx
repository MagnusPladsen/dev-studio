"use client";

import type { MenuTriggerProps } from "@/components/AssetContextMenu";
import type { Camera } from "@/lib/graph-camera";
import { isLabelVisible, type GraphEdge, type GraphNode, type SimNode } from "@/lib/story-graph";
import type { GraphGestures } from "./useGraphGestures";

const DIMMED_OPACITY = 0.12;
const LABEL_FONT_PX = 12;

export interface Highlight {
  activeKey: string | null;
  neighbours: Set<string>;
  focusKey: string | null;
}

interface NodeHandlers {
  gestures: GraphGestures;
  onOpen(node: GraphNode): void;
  onHover(key: string | null): void;
  menuProps(node: GraphNode): MenuTriggerProps;
}

function isEmphasised(key: string, highlight: Highlight): boolean {
  return key === highlight.activeKey || highlight.neighbours.has(key);
}

function toScreen(position: SimNode, camera: Camera): { x: number; y: number } {
  return { x: position.x * camera.scale + camera.x, y: position.y * camera.scale + camera.y };
}

function EdgeLine({ edge, from, to, color, highlight }: { edge: GraphEdge; from: { x: number; y: number }; to: { x: number; y: number }; color: string; highlight: Highlight }): React.JSX.Element {
  const { activeKey } = highlight;
  const isTouching = activeKey !== null && (edge.from === activeKey || edge.to === activeKey);
  const opacity = activeKey === null ? 0.7 : isTouching ? 1 : DIMMED_OPACITY;
  return (
    <line
      x1={from.x}
      y1={from.y}
      x2={to.x}
      y2={to.y}
      stroke={isTouching ? color : "var(--border-hover)"}
      strokeWidth={isTouching ? 2 : 1.25}
      strokeDasharray={edge.source === "wiki" ? "5 4" : undefined}
      opacity={opacity}
      className="transition-opacity duration-150"
    />
  );
}

function nodeEventProps(node: GraphNode, index: number, handlers: NodeHandlers): React.SVGProps<SVGGElement> {
  const menu = handlers.menuProps(node);
  return {
    ...menu,
    onPointerDown: (event) => {
      menu.onPointerDown(event);
      handlers.gestures.onNodePointerDown(event, index);
    },
    onPointerEnter: (event) => event.pointerType === "mouse" && handlers.onHover(node.key),
    onPointerLeave: (event) => {
      menu.onPointerLeave(event);
      if (event.pointerType === "mouse") handlers.onHover(null);
    },
    onFocus: () => handlers.onHover(node.key),
    onBlur: () => handlers.onHover(null),
    onClick: () => !handlers.gestures.consumeDrag() && handlers.onOpen(node),
    onKeyDown: (event) => {
      menu.onKeyDown(event);
      if (event.key === "Enter" || event.key === " ") handlers.onOpen(node);
    },
  };
}

interface NodeViewProps {
  node: GraphNode;
  index: number;
  position: SimNode;
  camera: Camera;
  highlight: Highlight;
  handlers: NodeHandlers;
}

function NodeView({ node, index, position, camera, highlight, handlers }: NodeViewProps): React.JSX.Element {
  const { x, y } = toScreen(position, camera);
  const radius = node.radius * camera.scale;
  const emphasised = isEmphasised(node.key, highlight) || node.key === highlight.focusKey;
  const isDimmed = highlight.activeKey !== null && !isEmphasised(node.key, highlight);
  const isStory = node.kind === "story";
  return (
    <g
      transform={`translate(${x} ${y})`}
      role="button"
      tabIndex={0}
      aria-label={`Open ${node.label.toLowerCase()} ${node.title}`}
      opacity={isDimmed ? DIMMED_OPACITY : 1}
      className="transition-opacity duration-150 outline-none"
      style={{ cursor: "pointer" }}
      {...nodeEventProps(node, index, handlers)}
    >
      <circle r={Math.max(radius, 12)} fill="transparent" />
      {node.key === highlight.focusKey && <circle r={radius + 5} fill="none" stroke="var(--accent)" strokeWidth={2} />}
      <circle r={radius} fill={isStory ? node.color : "var(--bg-primary)"} stroke={node.color} strokeWidth={isStory ? 0 : 2} />
      {isLabelVisible(node.radius, camera.scale, emphasised) && (
        <text
          y={radius + LABEL_FONT_PX + 2}
          textAnchor="middle"
          fontSize={LABEL_FONT_PX}
          fontWeight={node.key === highlight.activeKey ? 600 : 400}
          fill={isStory ? "var(--text-primary)" : "var(--text-secondary)"}
          stroke="var(--bg-primary)"
          strokeWidth={3}
          paintOrder="stroke"
          className="select-none pointer-events-none"
        >
          {node.title.length > 28 ? `${node.title.slice(0, 27)}…` : node.title}
        </text>
      )}
    </g>
  );
}

interface GraphSceneProps extends NodeHandlers {
  svgRef: React.RefObject<SVGSVGElement | null>;
  nodes: GraphNode[];
  edges: GraphEdge[];
  positions: SimNode[];
  camera: Camera;
  highlight: Highlight;
}

export function GraphScene({ svgRef, nodes, edges, positions, camera, highlight, ...handlers }: GraphSceneProps): React.JSX.Element {
  const byKey = new Map(nodes.map((node, index) => [node.key, index]));
  const activeColor = highlight.activeKey ? nodes[byKey.get(highlight.activeKey) ?? -1]?.color : undefined;
  return (
    <svg
      ref={svgRef}
      className="absolute inset-0 w-full h-full touch-none select-none"
      style={{ cursor: "grab" }}
      onPointerDown={handlers.gestures.onBackgroundPointerDown}
      aria-label="Connection graph"
    >
      <g>
        {edges.map((edge) => {
          const from = positions[byKey.get(edge.from)!];
          const to = positions[byKey.get(edge.to)!];
          return <EdgeLine key={edge.key} edge={edge} from={toScreen(from, camera)} to={toScreen(to, camera)} color={activeColor ?? "var(--accent)"} highlight={highlight} />;
        })}
      </g>
      {nodes.map((node, index) => (
        <NodeView key={node.key} node={node} index={index} position={positions[index]} camera={camera} highlight={highlight} handlers={handlers} />
      ))}
    </svg>
  );
}
