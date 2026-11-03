"use client";

import { useRef, useState } from "react";
import type { DiagramEdge, DiagramNode } from "@/types";
import { borderPoint, type Point, type Rect } from "@/lib/diagrams/geometry";
import { pointsAttribute, relationMark, routeEdge, type Segment } from "@/lib/diagrams/edge-route";
import { cardinalityEnds } from "@/lib/diagrams/tables";
import { getShape } from "@/lib/canvas-shapes";
import { routeFor } from "@/lib/canvas-shapes/routes";

interface EdgeLayerProps {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  rectOf(node: DiagramNode): Rect;
  selectedEdgeId: string | null;
  editingEdgeId: string | null;
  draft: { fromId: string; fromRow?: string; to: Point } | null;
  onLabelCommit(edgeId: string, label: string): void;
  onLabelCancel(): void;
}

const LINE = "#555570";
const SELECTED = "#ffffff";

function Arrowhead({ id, color }: { id: string; color: string }) {
  return (
    <marker id={id} viewBox="0 0 12 10" refX="11" refY="5" markerWidth="12" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto">
      <path d="M0,0 L12,5 L0,10 Z" fill={color} />
    </marker>
  );
}

/** A path as a plain line when it is straight (most lines), or a polyline when it bends out of a table row. */
type Paint = Pick<React.SVGProps<SVGLineElement>, "stroke" | "strokeWidth" | "strokeDasharray" | "markerEnd" | "style">;

function Path({ points, ...paint }: { points: Point[] } & Paint) {
  if (points.length === 2) return <line x1={points[0].x} y1={points[0].y} x2={points[1].x} y2={points[1].y} {...paint} />;
  return <polyline points={pointsAttribute(points)} fill="none" {...paint} />;
}

function relationMarks(edge: DiagramEdge, points: Point[]): Segment[] {
  if (!edge.cardinality) return [];
  const [fromEnd, toEnd] = cardinalityEnds(edge.cardinality);
  return [...relationMark(points, "start", fromEnd), ...relationMark(points, "end", toEnd)];
}

function EdgeLabel({ label, at, isSelected }: { label: string; at: Point; isSelected: boolean }) {
  const width = label.length * 6.2 + 14;
  return (
    <g style={{ pointerEvents: "all" }}>
      <rect x={at.x - width / 2} y={at.y - 9} width={width} height={18} rx={9} fill="#14141d" stroke={isSelected ? SELECTED : "#2e2e40"} />
      <text x={at.x} y={at.y + 0.5} textAnchor="middle" dominantBaseline="middle" fontSize={11} fill="#c4c4dc" fontFamily="system-ui, sans-serif">
        {label}
      </text>
    </g>
  );
}

function LabelEditor({ edge, at, onCommit, onCancel }: { edge: DiagramEdge; at: Point; onCommit(label: string): void; onCancel(): void }) {
  const [text, setText] = useState(edge.label ?? "");
  const isCancelled = useRef(false);
  return (
    <input
      data-card-control=""
      autoFocus
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => (isCancelled.current ? onCancel() : onCommit(text))}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          isCancelled.current = true;
          e.currentTarget.blur();
        }
      }}
      placeholder="Label"
      aria-label="Line label"
      className="absolute px-2 py-0.5 rounded-full text-xs outline-none w-36 -translate-x-1/2 -translate-y-1/2"
      style={{ left: at.x, top: at.y, background: "var(--bg-card)", color: "var(--text-primary)", border: "1px solid var(--accent)" }}
    />
  );
}

/** Lines between cards, drawn under the cards. Each line has a wide invisible stroke for easy clicking. */
export function EdgeLayer({ nodes, edges, rectOf, selectedEdgeId, editingEdgeId, draft, onLabelCommit, onLabelCancel }: EdgeLayerProps) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const lines = edges.flatMap((edge) => {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to) return [];
    const { points, labelAt } = routeFor(edge, from, to, rectOf);
    return [{ edge, points, labelAt }];
  });
  const draftPoints = draft ? draftPath(draft) : null;
  const editing = lines.find((line) => line.edge.id === editingEdgeId);

  function draftPath({ fromId, fromRow, to }: NonNullable<EdgeLayerProps["draft"]>): Point[] | null {
    const from = byId.get(fromId);
    if (!from) return null;
    const anchorY = fromRow === undefined ? undefined : getShape(from.type).anchorY?.(from, fromRow);
    if (anchorY === undefined) return [borderPoint(rectOf(from), to), to];
    return [...routeEdge({ rect: rectOf(from), anchorY }, { rect: { ...to, width: 0, height: 0 } }).points.slice(0, -1), to];
  }

  return (
    <>
      <svg className="absolute left-0 top-0 overflow-visible pointer-events-none" width="1" height="1" aria-hidden>
        <defs>
          <Arrowhead id="diagram-arrow" color={LINE} />
          <Arrowhead id="diagram-arrow-selected" color={SELECTED} />
        </defs>
        {lines.map(({ edge, points, labelAt }) => {
          const isSelected = edge.id === selectedEdgeId;
          const color = isSelected ? SELECTED : LINE;
          return (
            <g key={edge.id} data-edge-id={edge.id} style={{ cursor: "pointer" }}>
              <Path points={points} stroke="transparent" strokeWidth={14} style={{ pointerEvents: "stroke" }} />
              <Path
                points={points}
                stroke={color}
                strokeWidth={isSelected ? 2.5 : 1.5}
                strokeDasharray={edge.type === "dashed" ? "6 4" : undefined}
                markerEnd={edge.type === "line" || edge.cardinality ? undefined : `url(#${isSelected ? "diagram-arrow-selected" : "diagram-arrow"})`}
              />
              {relationMarks(edge, points).map(([a, b], index) => (
                <line key={index} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={isSelected ? 2 : 1.5} strokeLinecap="round" />
              ))}
              {edge.label && edge.id !== editingEdgeId && <EdgeLabel label={edge.label} at={labelAt} isSelected={isSelected} />}
            </g>
          );
        })}
        {draftPoints && <Path points={draftPoints} stroke="var(--accent)" strokeWidth={2} strokeDasharray="4 4" />}
      </svg>
      {editing && (
        <LabelEditor
          key={editing.edge.id}
          edge={editing.edge}
          at={editing.labelAt}
          onCommit={(label) => onLabelCommit(editing.edge.id, label)}
          onCancel={onLabelCancel}
        />
      )}
    </>
  );
}
