import { v4 as uuid } from "uuid";
import type { Diagram, DiagramEdge, DiagramNode } from "@/types";
import { getShape } from "@/lib/canvas-shapes";
import { drawingData, strokeFromPoints } from "@/lib/diagrams/freehand";
import type { Point } from "@/lib/diagrams/geometry";
import { ImportError, type Importer } from "@/lib/import";

/** The parts of an Excalidraw element this importer reads. */
interface ExcalidrawElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  angle?: number;
  isDeleted?: boolean;
  strokeColor?: string;
  backgroundColor?: string;
  strokeStyle?: string;
  text?: string;
  originalText?: string;
  name?: string | null;
  containerId?: string | null;
  points?: [number, number][];
  startBinding?: { elementId: string } | null;
  endBinding?: { elementId: string } | null;
  startArrowhead?: string | null;
  endArrowhead?: string | null;
  fileId?: string | null;
}

interface ExcalidrawFile {
  elements: ExcalidrawElement[];
  files: Record<string, { dataURL?: string }>;
}

const SHAPES = new Set(["rectangle", "ellipse", "diamond"]);
const LINES = new Set(["arrow", "line"]);
const MARGIN = 40;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

function readFile(data: unknown): ExcalidrawFile {
  if (!isRecord(data) || data.type !== "excalidraw" || !Array.isArray(data.elements)) {
    throw new ImportError("This isn't an Excalidraw drawing. In Excalidraw, use Menu → Save to… to get a .excalidraw file.");
  }
  const elements = data.elements.filter(
    (element): element is ExcalidrawElement => isRecord(element) && typeof element.id === "string" && typeof element.type === "string" && [element.x, element.y, element.width, element.height].every(isNumber) && !element.isDeleted
  );
  return { elements, files: isRecord(data.files) ? (data.files as ExcalidrawFile["files"]) : {} };
}

/** A colour the Canvas can tint with (#rrggbb), skipping transparent and Excalidraw's near-black default ink. */
function tint(color: string | undefined): string | undefined {
  const hex = color?.trim().toLowerCase() ?? "";
  const full = /^#[0-9a-f]{3}$/.test(hex) ? `#${[...hex.slice(1)].map((digit) => digit + digit).join("")}` : hex;
  if (!/^#[0-9a-f]{6}$/.test(full)) return undefined;
  const [r, g, b] = [1, 3, 5].map((start) => parseInt(full.slice(start, start + 2), 16));
  const lightness = (Math.max(r, g, b) + Math.min(r, g, b)) / 2;
  return lightness < 60 || lightness > 240 ? undefined : full;
}

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

function sized(type: DiagramNode["type"], element: ExcalidrawElement): Pick<DiagramNode, "x" | "y" | "width" | "height"> {
  const { minSize } = getShape(type);
  return { x: Math.round(element.x), y: Math.round(element.y), width: Math.round(Math.max(minSize.width, element.width)), height: Math.round(Math.max(minSize.height, element.height)) };
}

function absolutePoints(element: ExcalidrawElement): Point[] {
  return (element.points ?? []).filter((point) => isNumber(point[0]) && isNumber(point[1])).map(([x, y]) => ({ x: element.x + x, y: element.y + y }));
}

function drawingNode(element: ExcalidrawElement): DiagramNode | null {
  const points = absolutePoints(element);
  if (!points.length) return null;
  const stroke = strokeFromPoints(points);
  const color = tint(element.strokeColor);
  return { id: uuid(), type: "drawing", label: "", x: stroke.x, y: stroke.y, width: stroke.width, height: stroke.height, data: drawingData(stroke), ...(color ? { color } : {}) };
}

function edgeBetween(element: ExcalidrawElement, from: string, to: string, label: string): DiagramEdge {
  const isDashed = element.strokeStyle === "dashed" || element.strokeStyle === "dotted";
  const hasHead = element.type === "arrow" && Boolean(element.endArrowhead || element.startArrowhead);
  const isReversed = !element.endArrowhead && Boolean(element.startArrowhead);
  return { id: uuid(), from: isReversed ? to : from, to: isReversed ? from : to, label, type: isDashed ? "dashed" : hasHead ? "arrow" : "line" };
}

/** Moves everything so the drawing starts just inside the board's top-left corner. */
function shiftToOrigin(nodes: DiagramNode[]): DiagramNode[] {
  if (!nodes.length) return nodes;
  const dx = MARGIN - Math.min(...nodes.map((node) => node.x));
  const dy = MARGIN - Math.min(...nodes.map((node) => node.y));
  return nodes.map((node) => ({ ...node, x: Math.round(node.x + dx), y: Math.round(node.y + dy) }));
}

/** Converts the drawing: shapes, text, frames and images become cards, attached arrows become lines. */
export function canvasFromExcalidraw(file: ExcalidrawFile, name: string): { diagram: Diagram; warnings: string[] } {
  const labels = new Map<string, string>();
  for (const element of file.elements) {
    if (element.type === "text" && element.containerId) labels.set(element.containerId, element.originalText ?? element.text ?? "");
  }
  const nodeIds = new Map<string, string>();
  const groups: DiagramNode[] = [];
  const cards: DiagramNode[] = [];
  const edges: DiagramEdge[] = [];
  const counts = { rotated: 0, loose: 0, missingImages: 0, unsupported: new Set<string>() };

  const addCard = (element: ExcalidrawElement, node: DiagramNode, list = cards) => {
    nodeIds.set(element.id, node.id);
    list.push(node);
    if (element.angle) counts.rotated++;
  };

  for (const element of file.elements) {
    if (SHAPES.has(element.type)) {
      const type = element.type as DiagramNode["type"];
      const color = tint(element.backgroundColor) ?? tint(element.strokeColor);
      addCard(element, { id: uuid(), type, label: labels.get(element.id) ?? "", ...sized(type, element), ...(color ? { color } : {}) });
    } else if (element.type === "text" && !(element.containerId && file.elements.some((other) => other.id === element.containerId))) {
      addCard(element, { id: uuid(), type: "note", label: element.originalText ?? element.text ?? "", ...sized("note", element) });
    } else if (element.type === "frame") {
      addCard(element, { id: uuid(), type: "group", label: element.name ?? "Frame", ...sized("group", element) }, groups);
    } else if (element.type === "image") {
      const src = element.fileId ? file.files[element.fileId]?.dataURL : undefined;
      if (!src) counts.missingImages++;
      else addCard(element, { id: uuid(), type: "image", label: "", ...sized("image", element), data: { src, aspect: element.width / element.height || 1 } });
    } else if (element.type === "freedraw") {
      const node = drawingNode(element);
      if (node) cards.push(node);
    } else if (!LINES.has(element.type) && element.type !== "text") counts.unsupported.add(element.type);
  }

  for (const element of file.elements.filter((candidate) => LINES.has(candidate.type))) {
    const from = element.startBinding ? nodeIds.get(element.startBinding.elementId) : undefined;
    const to = element.endBinding ? nodeIds.get(element.endBinding.elementId) : undefined;
    if (from && to && from !== to) {
      edges.push(edgeBetween(element, from, to, labels.get(element.id) ?? ""));
      continue;
    }
    const node = drawingNode(element);
    if (node) cards.push(node);
    if (element.type === "arrow") counts.loose++;
  }

  const warnings = [];
  if (counts.loose) warnings.push(`${plural(counts.loose, "arrow wasn't", "arrows weren't")} attached to two shapes, so ${counts.loose === 1 ? "it was" : "they were"} drawn as a line without a head`);
  if (counts.rotated) warnings.push(`${plural(counts.rotated, "rotated shape was", "rotated shapes were")} placed straight`);
  if (counts.missingImages) warnings.push(`Left out ${plural(counts.missingImages, "image", "images")} whose picture wasn't saved in the file`);
  if (counts.unsupported.size) warnings.push(`Left out elements the Canvas has no card for: ${[...counts.unsupported].join(", ")}`);
  const now = new Date().toISOString();
  return { diagram: { id: uuid(), projectId: "", name, nodes: shiftToOrigin([...groups, ...cards]), edges, tags: [], createdAt: now, updatedAt: now }, warnings };
}

/** Excalidraw drawings (`.excalidraw`, or the same JSON saved as `.json`) as a new canvas. */
export const excalidrawImporter: Importer<Diagram> = {
  id: "canvas-excalidraw",
  label: "Excalidraw (.excalidraw)",
  description: "Shapes, text, arrows, pen strokes and images, as a new canvas",
  accept: [".excalidraw", "application/vnd.excalidraw+json", ".json", "application/json"],
  detect(_file, text) {
    try {
      const data: unknown = JSON.parse(text);
      return isRecord(data) && data.type === "excalidraw";
    } catch {
      return false;
    }
  },
  async parse(file) {
    const drawing = readFile(JSON.parse(await file.text()));
    if (!drawing.elements.length) throw new ImportError(`"${file.name}" is an empty Excalidraw drawing.`);
    const { diagram, warnings } = canvasFromExcalidraw(drawing, file.name.replace(/\.(excalidraw|json)$/i, "") || "Excalidraw drawing");
    return { items: [diagram], warnings };
  },
};
