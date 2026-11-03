"use client";

import { memo, useEffect, useRef } from "react";
import type { DiagramNode } from "@/types";
import { getShape, type BodyKind } from "@/lib/canvas-shapes";
import {
  AssetBody,
  ChecklistBody,
  DrawingBody,
  GroupBody,
  ImageBody,
  LinkBody,
  NoteBody,
  ShapeBody,
  type BodyProps,
} from "./CardBodies";
import { TableBody } from "./TableBody";

interface DiagramCardProps {
  node: DiagramNode;
  projectId: string;
  isSelected: boolean;
  /** Resize and connect handles show only when this card is the one selected card. */
  hasHandles: boolean;
  isEditing: boolean;
  isConnectSource: boolean;
  isLoading: boolean;
  onMeasure(id: string, height: number): void;
  onCommit(id: string, patch: Partial<DiagramNode>): void;
  onStopEditing(): void;
  onPickImage(id: string): void;
}

const BODIES: Record<BodyKind, (props: BodyProps) => React.ReactNode> = {
  shape: ShapeBody,
  drawing: DrawingBody,
  checklist: ChecklistBody,
  image: ImageBody,
  link: LinkBody,
  asset: AssetBody,
  group: GroupBody,
  note: NoteBody,
  table: TableBody,
};

function Body(props: BodyProps) {
  const Component = BODIES[getShape(props.node.type).body];
  return <Component {...props} />;
}

/** One card on the board. The page finds it from pointer events through `data-node-id`. */
export const DiagramCard = memo(function DiagramCard(props: DiagramCardProps) {
  const { node, isSelected, hasHandles, isEditing, isConnectSource, onMeasure } = props;
  const shape = getShape(node.type);
  const isDrawing = shape.body === "drawing";
  const ref = useRef<HTMLDivElement>(null);
  const isAuto = shape.isAutoHeight;

  useEffect(() => {
    const element = ref.current;
    if (!element || !isAuto) return;
    const observer = new ResizeObserver(() => onMeasure(node.id, element.offsetHeight));
    observer.observe(element);
    return () => observer.disconnect();
  }, [isAuto, node.id, onMeasure]);

  const outline = isConnectSource ? "2px solid var(--text-primary)" : isSelected ? "2px solid var(--accent)" : undefined;
  return (
    <div
      ref={ref}
      data-node-id={node.id}
      className="absolute select-none"
      style={{
        left: node.x,
        top: node.y,
        width: node.width,
        height: isAuto ? undefined : shape.contentHeight?.(node) ?? node.height,
        outline,
        outlineOffset: 3,
        borderRadius: isDrawing ? 4 : 12,
        cursor: "grab",
        // A drawing only catches the pointer on its stroke, so cards under its box stay clickable.
        pointerEvents: isDrawing ? "none" : undefined,
      }}
    >
      <Body
        node={node}
        projectId={props.projectId}
        isEditing={isEditing}
        isLoading={props.isLoading}
        hasHandles={hasHandles}
        onCommit={(patch) => props.onCommit(node.id, patch)}
        onCancel={props.onStopEditing}
        onPickImage={() => props.onPickImage(node.id)}
      />
      {hasHandles && !isEditing && (
        <>
          {!shape.anchorY && (
            <span
              data-connect-handle=""
              className="absolute top-1/2 -right-3 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 pointer-events-auto max-md:w-5 max-md:h-5 max-md:-right-4"
              style={{ background: "var(--accent)", borderColor: "var(--bg-primary)", cursor: "crosshair" }}
              title="Drag onto another card to connect them"
            />
          )}
          <span
            data-resize-handle=""
            className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 rounded-sm border-2 pointer-events-auto max-md:w-5 max-md:h-5 max-md:-bottom-2.5 max-md:-right-2.5"
            style={{ background: "var(--bg-card)", borderColor: "var(--accent)", cursor: "nwse-resize" }}
            title="Drag to resize"
          />
        </>
      )}
    </div>
  );
});
