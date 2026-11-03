import type { DiagramEdge, DiagramNode } from "@/types";
import { getShape } from "@/lib/canvas-shapes";
import { BOARD_BG, CARD_BORDER, FONT, LABEL_BG, LABEL_TEXT, LINE, PAD } from "./export-style";
import { boundsOf, edgeEndpoints, edgeLabelPos, type Rect } from "./geometry";
import type { RenderInput } from "./render-png";
import { escapeXml } from "./svg-cards";

function edgeSvg(edge: DiagramEdge, from: Rect, to: Rect): string {
  const { start, end } = edgeEndpoints(from, to);
  const dash = edge.type === "dashed" ? ` stroke-dasharray="6 4"` : "";
  const marker = edge.type === "line" ? "" : ` marker-end="url(#arrow)"`;
  let svg = `<line x1="${start.x}" y1="${start.y}" x2="${end.x}" y2="${end.y}" stroke="${LINE}" stroke-width="1.5"${dash}${marker}/>`;
  if (!edge.label) return svg;
  const at = edgeLabelPos(start, end);
  const width = edge.label.length * 6.2 + 14;
  svg += `<rect x="${at.x - width / 2}" y="${at.y - 9}" width="${width}" height="18" rx="9" fill="${LABEL_BG}" stroke="${CARD_BORDER}"/>`;
  return svg + `<text x="${at.x}" y="${at.y + 0.5}" font-size="11" fill="${LABEL_TEXT}" text-anchor="middle" dominant-baseline="middle">${escapeXml(edge.label)}</text>`;
}

function nodeSvg(node: DiagramNode, input: RenderInput): string {
  return getShape(node.type).toSvg(node, input.rectOf(node), input);
}

/** The whole board, cropped to its cards, as a standalone SVG document that keeps text and shapes sharp. */
export function renderDiagramSvg(input: RenderInput): string {
  const { diagram } = input;
  const bounds = boundsOf(diagram.nodes.map(input.rectOf)) ?? { x: 0, y: 0, width: 400, height: 300 };
  const width = bounds.width + PAD * 2;
  const height = bounds.height + PAD * 2;
  const byId = new Map(diagram.nodes.map((node) => [node.id, node]));
  const isBack = (node: DiagramNode) => getShape(node.type).layer === "back";
  const groups = diagram.nodes.filter(isBack).map((n) => nodeSvg(n, input));
  const edges = diagram.edges.flatMap((edge) => {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    return from && to ? [edgeSvg(edge, input.rectOf(from), input.rectOf(to))] : [];
  });
  const cards = diagram.nodes.filter((n) => !isBack(n)).map((n) => nodeSvg(n, input));
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${bounds.x - PAD} ${bounds.y - PAD} ${width} ${height}" font-family="${FONT}">`,
    `<defs><marker id="arrow" viewBox="0 0 12 10" refX="11" refY="5" markerWidth="12" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto"><path d="M0,0 L12,5 L0,10 Z" fill="${LINE}"/></marker></defs>`,
    `<rect x="${bounds.x - PAD}" y="${bounds.y - PAD}" width="${width}" height="${height}" fill="${BOARD_BG}"/>`,
    ...groups,
    ...edges,
    ...cards,
    "</svg>",
  ].join("\n");
}
