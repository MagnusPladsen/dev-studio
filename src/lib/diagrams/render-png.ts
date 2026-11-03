import type { Diagram, DiagramEdge, DiagramNode } from "@/types";
import { getShape } from "@/lib/canvas-shapes";
import { BOARD_BG, CARD_BORDER, FONT, LABEL_BG, LABEL_TEXT, LINE, PAD } from "./export-style";
import { routeFor } from "@/lib/canvas-shapes/routes";
import { relationMark, type EdgeRoute } from "./edge-route";
import { boundsOf, type Rect } from "./geometry";
import { cardinalityEnds } from "./tables";
import type { Images } from "./png-cards";

export interface AssetLook {
  name: string;
  kind: string;
  color: string;
  thumbnail?: string;
}

export interface RenderInput {
  diagram: Diagram;
  rectOf(node: DiagramNode): Rect;
  describeAsset(node: DiagramNode): AssetLook | null;
}

const SCALE = 2;
const MAX_SIDE = 8000;

function loadForCanvas(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    if (!src.startsWith("data:")) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function imageSources(input: RenderInput): string[] {
  return input.diagram.nodes.flatMap((node) => getShape(node.type).imageSources?.(node, input) ?? []).filter(Boolean);
}

function drawRelationEnds(ctx: CanvasRenderingContext2D, edge: DiagramEdge, points: EdgeRoute["points"]) {
  if (!edge.cardinality) return;
  const [fromEnd, toEnd] = cardinalityEnds(edge.cardinality);
  ctx.lineCap = "round";
  ctx.beginPath();
  for (const [a, b] of [...relationMark(points, "start", fromEnd), ...relationMark(points, "end", toEnd)]) {
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();
  ctx.lineCap = "butt";
}

function drawEdge(ctx: CanvasRenderingContext2D, edge: DiagramEdge, { points, labelAt: pos }: EdgeRoute) {
  const start = points[points.length - 2];
  const end = points[points.length - 1];
  ctx.strokeStyle = LINE;
  ctx.fillStyle = LINE;
  ctx.lineWidth = 1.5;
  ctx.setLineDash(edge.type === "dashed" ? [6, 4] : []);
  ctx.beginPath();
  points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.stroke();
  ctx.setLineDash([]);
  drawRelationEnds(ctx, edge, points);
  if (edge.type !== "line" && !edge.cardinality) {
    const angle = Math.atan2(end.y - start.y, end.x - start.x);
    ctx.beginPath();
    ctx.moveTo(end.x, end.y);
    ctx.lineTo(end.x - 12 * Math.cos(angle - 0.4), end.y - 12 * Math.sin(angle - 0.4));
    ctx.lineTo(end.x - 12 * Math.cos(angle + 0.4), end.y - 12 * Math.sin(angle + 0.4));
    ctx.closePath();
    ctx.fill();
  }
  if (!edge.label) return;
  ctx.font = `11px ${FONT}`;
  const width = ctx.measureText(edge.label).width + 12;
  ctx.fillStyle = LABEL_BG;
  ctx.strokeStyle = CARD_BORDER;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(pos.x - width / 2, pos.y - 9, width, 18, 9);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = LABEL_TEXT;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(edge.label, pos.x, pos.y + 0.5);
}

function drawNode(ctx: CanvasRenderingContext2D, node: DiagramNode, input: RenderInput, images: Images) {
  getShape(node.type).drawPng(ctx, node, input.rectOf(node), { ...input, images });
}

/** Draws the whole board, cropped to its cards, onto a canvas for a PNG download. */
export async function renderDiagramPng(input: RenderInput): Promise<HTMLCanvasElement> {
  const { diagram } = input;
  const bounds = boundsOf(diagram.nodes.map(input.rectOf)) ?? { x: 0, y: 0, width: 400, height: 300 };
  const width = bounds.width + PAD * 2;
  const height = bounds.height + PAD * 2;
  const scale = Math.min(SCALE, MAX_SIDE / width, MAX_SIDE / height);
  const sources = [...new Set(imageSources(input))];
  const images = new Map(await Promise.all(sources.map(async (src) => [src, await loadForCanvas(src)] as const)));

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  ctx.fillStyle = BOARD_BG;
  ctx.fillRect(0, 0, width, height);
  ctx.translate(PAD - bounds.x, PAD - bounds.y);

  const byId = new Map(diagram.nodes.map((node) => [node.id, node]));
  const isBack = (node: DiagramNode) => getShape(node.type).layer === "back";
  for (const node of diagram.nodes) if (isBack(node)) drawNode(ctx, node, input, images);
  for (const edge of diagram.edges) {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (from && to) drawEdge(ctx, edge, routeFor(edge, from, to, input.rectOf));
  }
  for (const node of diagram.nodes) if (!isBack(node)) drawNode(ctx, node, input, images);
  return canvas;
}
