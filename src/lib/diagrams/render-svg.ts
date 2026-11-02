import type { DiagramEdge, DiagramNode } from "@/types";
import { borderColor, checklistItems, hasShapeBody, hostname, imageSrc, isBasicShape, linkPreview, linkUrl } from "./cards";
import { embedFor } from "./embeds";
import { BOARD_BG, CARD_BG, CARD_BORDER, DONE, FONT, LABEL_BG, LABEL_TEXT, LINE, MUTED, PAD, TEXT } from "./export-style";
import { DRAWING_STROKE, placedPoints, smoothPath } from "./freehand";
import { boundsOf, edgeEndpoints, edgeLabelPos, GROUP_HEADER, type Rect } from "./geometry";
import type { AssetLook, RenderInput } from "./render-png";
import { polygonPoints, shapeOutline } from "./shapes";

/** Rough glyph width as a share of the font size; SVG export can't measure text, so it wraps by estimate. */
const CHAR_WIDTH = 0.56;

export function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/** Breaks text into lines that should fit `maxWidth` at `fontSize`, keeping the text's own line breaks. */
export function wrapByWidth(text: string, maxWidth: number, fontSize: number): string[] {
  const maxChars = Math.max(1, Math.floor(maxWidth / (fontSize * CHAR_WIDTH)));
  return text.split("\n").flatMap((paragraph) => {
    const lines: string[] = [];
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && candidate.length > maxChars) {
        lines.push(line);
        line = word;
      } else line = candidate;
    }
    return [...lines, line];
  });
}

interface TextStyle {
  size: number;
  lineHeight: number;
  color: string;
  weight?: number;
  anchor?: "start" | "middle";
}

function textBlock(lines: string[], x: number, y: number, style: TextStyle): string {
  if (lines.length === 0) return "";
  const weight = style.weight ? ` font-weight="${style.weight}"` : "";
  const spans = lines
    .map((line, i) => `<tspan x="${x}" dy="${i === 0 ? 0 : style.lineHeight}">${escapeXml(line)}</tspan>`)
    .join("");
  return `<text x="${x}" y="${y}" font-size="${style.size}"${weight} fill="${escapeXml(style.color)}" text-anchor="${style.anchor ?? "start"}" dominant-baseline="hanging">${spans}</text>`;
}

function linesThatFit(lines: string[], top: number, lineHeight: number, bottom: number): string[] {
  return lines.slice(0, Math.max(0, Math.floor((bottom - top) / lineHeight)));
}

function cardBox(node: DiagramNode, r: Rect, radius = 10): string {
  const tint = node.color ? `<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" rx="${radius}" fill="${escapeXml(node.color)}" fill-opacity="0.15"/>` : "";
  return `<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" rx="${radius}" fill="${CARD_BG}"/>${tint}<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" rx="${radius}" fill="none" stroke="${escapeXml(node.color ?? CARD_BORDER)}" stroke-width="1.5"/>`;
}

function picture(href: string, r: Rect): string {
  return `<svg x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" viewBox="0 0 ${r.width} ${r.height}" preserveAspectRatio="xMidYMid slice"><image href="${escapeXml(href)}" width="${r.width}" height="${r.height}" preserveAspectRatio="xMidYMid slice"/></svg>`;
}

function outlineSvg(node: DiagramNode, r: Rect, paint: string): string {
  const outline = shapeOutline(node.type, r);
  if (outline.kind === "polygon") return `<polygon points="${polygonPoints(outline.points)}" ${paint}/>`;
  if (outline.kind === "ellipse") return `<ellipse cx="${outline.cx}" cy="${outline.cy}" rx="${outline.rx}" ry="${outline.ry}" ${paint}/>`;
  return `<rect x="${outline.x}" y="${outline.y}" width="${outline.width}" height="${outline.height}" rx="${outline.radius}" ${paint}/>`;
}

function shapeSvg(node: DiagramNode, r: Rect): string {
  const isBasic = isBasicShape(node.type);
  const tint = node.color && isBasic ? outlineSvg(node, r, `fill="${escapeXml(node.color)}" fill-opacity="0.12"`) : "";
  const stroke = outlineSvg(node, r, `fill="none" stroke="${escapeXml(borderColor(node))}" stroke-width="${isBasic ? 2 : 1.5}"`);
  const lines = wrapByWidth(node.label, r.width - 20, 13).slice(0, isBasic ? 8 : 3);
  const top = r.y + r.height / 2 - (lines.length * 16) / 2 + 2;
  const label = textBlock(lines, r.x + r.width / 2, top, { size: 13, lineHeight: 16, color: TEXT, anchor: "middle" });
  return outlineSvg(node, r, `fill="${CARD_BG}"`) + tint + stroke + label;
}

function drawingSvg(node: DiagramNode): string {
  const d = smoothPath(placedPoints(node));
  return d ? `<path d="${d}" fill="none" stroke="${escapeXml(borderColor(node))}" stroke-width="${DRAWING_STROKE}" stroke-linecap="round" stroke-linejoin="round"/>` : "";
}

function groupSvg(node: DiagramNode, r: Rect): string {
  const color = escapeXml(node.color ?? "#666680");
  const title = textBlock([node.label], r.x + 16, r.y + 13, { size: 14, lineHeight: 18, color: TEXT, weight: 600 });
  return `<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" rx="14" fill="${color}" fill-opacity="0.1" stroke="${color}" stroke-opacity="0.5" stroke-width="1.5"/>${r.height >= GROUP_HEADER ? title : ""}`;
}

function noteSvg(node: DiagramNode, r: Rect): string {
  const lines = linesThatFit(wrapByWidth(node.label, r.width - 28, 14), r.y + 12, 20, r.y + r.height - 8);
  return cardBox(node, r) + textBlock(lines, r.x + 14, r.y + 12, { size: 14, lineHeight: 20, color: TEXT });
}

function checklistSvg(node: DiagramNode, r: Rect): string {
  let svg = cardBox(node, r) + textBlock([node.label || "To-do"], r.x + 14, r.y + 12, { size: 14, lineHeight: 22, color: TEXT, weight: 600 });
  let y = r.y + 34;
  for (const item of checklistItems(node)) {
    if (y + 20 > r.y + r.height) break;
    const color = item.done ? DONE : MUTED;
    svg += `<rect x="${r.x + 14}" y="${y + 2}" width="12" height="12" fill="none" stroke="${color}" stroke-width="1.5"/>`;
    if (item.done) svg += `<rect x="${r.x + 17}" y="${y + 5}" width="6" height="6" fill="${DONE}"/>`;
    const lines = linesThatFit(wrapByWidth(item.text, r.width - 50, 13), y, 18, r.y + r.height);
    svg += textBlock(lines, r.x + 34, y, { size: 13, lineHeight: 18, color: item.done ? MUTED : TEXT });
    y += lines.length * 18 + 4;
  }
  return svg;
}

function imageSvg(node: DiagramNode, r: Rect): string {
  const src = imageSrc(node);
  const aspect = typeof node.data?.aspect === "number" ? node.data.aspect : 4 / 3;
  const media = { x: r.x, y: r.y, width: r.width, height: Math.min(r.height, r.width / aspect) };
  const caption = node.label
    ? textBlock(linesThatFit(wrapByWidth(node.label, r.width - 24, 13), media.y + media.height + 8, 18, r.y + r.height), r.x + 12, media.y + media.height + 8, { size: 13, lineHeight: 18, color: TEXT })
    : "";
  return cardBox(node, r, 8) + (src ? picture(src, media) : "") + caption;
}

function linkSvg(node: DiagramNode, r: Rect): string {
  const url = linkUrl(node) ?? "";
  const preview = linkPreview(node);
  const embed = url ? embedFor(url) : null;
  const thumb = preview.image ?? embed?.thumbnail;
  let svg = cardBox(node, r);
  let y = r.y + 12;
  if (thumb || embed) {
    const media = { x: r.x, y: r.y, width: r.width, height: Math.min(r.width / (16 / 9), r.height - 60) };
    svg += `<rect x="${media.x}" y="${media.y}" width="${media.width}" height="${media.height}" rx="10" fill="${BOARD_BG}"/>`;
    if (thumb) svg += picture(thumb, media);
    y = r.y + media.height + 10;
  }
  const title = wrapByWidth(preview.title || node.label || url, r.width - 28, 13).slice(0, 2);
  svg += textBlock(title, r.x + 14, y, { size: 13, lineHeight: 18, color: TEXT, weight: 600 });
  return svg + textBlock([preview.siteName || hostname(url)], r.x + 14, y + title.length * 18 + 2, { size: 12, lineHeight: 16, color: MUTED });
}

function assetSvg(node: DiagramNode, r: Rect, look: AssetLook | null): string {
  const color = escapeXml(look?.color ?? MUTED);
  let svg = cardBox(node, r) + `<rect x="${r.x}" y="${r.y}" width="5" height="${r.height}" fill="${color}"/>`;
  let x = r.x + 16;
  if (look?.thumbnail) {
    svg += `<image href="${escapeXml(look.thumbnail)}" x="${x}" y="${r.y + (r.height - 36) / 2}" width="36" height="36" style="image-rendering:pixelated"/>`;
    x += 46;
  }
  svg += textBlock([look?.kind ?? "Deleted asset"], x, r.y + 14, { size: 11, lineHeight: 14, color });
  return svg + textBlock([look?.name ?? node.label], x, r.y + 30, { size: 14, lineHeight: 18, color: TEXT, weight: 600 });
}

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
  const r = input.rectOf(node);
  if (hasShapeBody(node.type)) return shapeSvg(node, r);
  if (node.type === "drawing") return drawingSvg(node);
  if (node.type === "checklist") return checklistSvg(node, r);
  if (node.type === "image") return imageSvg(node, r);
  if (node.type === "link") return linkSvg(node, r);
  if (node.type === "asset") return assetSvg(node, r, input.describeAsset(node));
  if (node.type === "note") return noteSvg(node, r);
  return "";
}

/** The whole board, cropped to its cards, as a standalone SVG document that keeps text and shapes sharp. */
export function renderDiagramSvg(input: RenderInput): string {
  const { diagram } = input;
  const bounds = boundsOf(diagram.nodes.map(input.rectOf)) ?? { x: 0, y: 0, width: 400, height: 300 };
  const width = bounds.width + PAD * 2;
  const height = bounds.height + PAD * 2;
  const byId = new Map(diagram.nodes.map((node) => [node.id, node]));
  const groups = diagram.nodes.filter((n) => n.type === "group").map((n) => groupSvg(n, input.rectOf(n)));
  const edges = diagram.edges.flatMap((edge) => {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    return from && to ? [edgeSvg(edge, input.rectOf(from), input.rectOf(to))] : [];
  });
  const cards = diagram.nodes.filter((n) => n.type !== "group").map((n) => nodeSvg(n, input));
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
