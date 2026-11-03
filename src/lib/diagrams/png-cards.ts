import type { DiagramNode } from "@/types";
import type { ShapeDefinition } from "@/lib/canvas-shapes/types";
import { checklistItems, hostname, imageSrc, LINK_THUMB, linkLook, SONG_COVER, type LinkLook } from "./cards";
import { embedFor, imageUrlFor, PROVIDER_COLORS, PROVIDER_NAMES, type AudioEmbed, type EmbedProvider, type VideoEmbed } from "./embeds";
import { BOARD_BG, CARD_BG, CARD_BORDER, DONE, FONT, MUTED, PLAY_BG, PLAY_ICON, TEXT } from "./export-style";
import { DRAWING_STROKE, placedPoints } from "./freehand";
import type { Rect } from "./geometry";
import type { AssetLook } from "./render-png";
import type { ShapeOutline } from "./shapes";
import { keyColor, keyLabel, TABLE_HEADER, TABLE_ROW, tableColumns } from "./tables";

/** Pictures the PNG export loaded up front, by source; `null` when the host wouldn't share one. */
export type Images = Map<string, HTMLImageElement | null>;


export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(candidate).width > maxWidth) {
        lines.push(line);
        line = word;
      } else line = candidate;
    }
    lines.push(line);
  }
  return lines;
}

export function drawLines(ctx: CanvasRenderingContext2D, lines: string[], x: number, y: number, lineHeight: number, maxY: number) {
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  for (const line of lines) {
    if (y + lineHeight > maxY + 2) break;
    ctx.fillText(line, x, y);
    y += lineHeight;
  }
  return y;
}

function tint(color: string | undefined, alpha: string): string {
  return color ? `${color}${alpha}` : CARD_BG;
}

function cardBox(ctx: CanvasRenderingContext2D, rect: Rect, node: DiagramNode, radius = 10) {
  ctx.fillStyle = CARD_BG;
  ctx.beginPath();
  ctx.roundRect(rect.x, rect.y, rect.width, rect.height, radius);
  ctx.fill();
  if (node.color) {
    ctx.fillStyle = tint(node.color, "26");
    ctx.fill();
  }
  ctx.strokeStyle = node.color ?? CARD_BORDER;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, rect: Rect, radius: number) {
  const scale = Math.max(rect.width / img.naturalWidth, rect.height / img.naturalHeight);
  const width = img.naturalWidth * scale;
  const height = img.naturalHeight * scale;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(rect.x, rect.y, rect.width, rect.height, radius);
  ctx.clip();
  ctx.drawImage(img, rect.x + (rect.width - width) / 2, rect.y + (rect.height - height) / 2, width, height);
  ctx.restore();
}

function shapePath(ctx: CanvasRenderingContext2D, outline: ShapeOutline) {
  ctx.beginPath();
  if (outline.kind === "polygon") {
    outline.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
  } else if (outline.kind === "ellipse") {
    ctx.ellipse(outline.cx, outline.cy, outline.rx, outline.ry, 0, 0, Math.PI * 2);
  } else {
    ctx.roundRect(outline.x, outline.y, outline.width, outline.height, outline.radius);
  }
}

export function drawShape(ctx: CanvasRenderingContext2D, node: DiagramNode, r: Rect, shape: ShapeDefinition) {
  const isBasic = shape.shapeStyle === "basic";
  shapePath(ctx, shape.outline!(r));
  ctx.fillStyle = CARD_BG;
  ctx.fill();
  if (node.color && isBasic) {
    ctx.fillStyle = `${node.color}1f`;
    ctx.fill();
  }
  ctx.strokeStyle = node.color ?? shape.color;
  ctx.lineWidth = isBasic ? 2 : 1.5;
  ctx.stroke();
  ctx.fillStyle = TEXT;
  ctx.font = `13px ${FONT}`;
  const lines = wrapText(ctx, node.label, r.width - 20).slice(0, isBasic ? 8 : 3);
  const lineHeight = 16;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const top = r.y + r.height / 2 - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, i) => ctx.fillText(line, r.x + r.width / 2, top + i * lineHeight));
}

export function drawDrawing(ctx: CanvasRenderingContext2D, node: DiagramNode, shape: ShapeDefinition) {
  const points = placedPoints(node);
  if (points.length === 0) return;
  ctx.strokeStyle = node.color ?? shape.color;
  ctx.lineWidth = DRAWING_STROKE;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.stroke();
}

export function drawGroup(ctx: CanvasRenderingContext2D, node: DiagramNode, r: Rect) {
  const color = node.color ?? "#666680";
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.width, r.height, 14);
  ctx.fillStyle = `${color}1a`;
  ctx.fill();
  ctx.strokeStyle = `${color}80`;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = TEXT;
  ctx.font = `600 14px ${FONT}`;
  drawLines(ctx, [node.label], r.x + 16, r.y + 13, 18, r.y + r.height);
}

export function drawNote(ctx: CanvasRenderingContext2D, node: DiagramNode, r: Rect) {
  cardBox(ctx, r, node);
  ctx.fillStyle = TEXT;
  ctx.font = `14px ${FONT}`;
  drawLines(ctx, wrapText(ctx, node.label, r.width - 28), r.x + 14, r.y + 12, 20, r.y + r.height - 8);
}

export function drawChecklist(ctx: CanvasRenderingContext2D, node: DiagramNode, r: Rect) {
  cardBox(ctx, r, node);
  ctx.fillStyle = TEXT;
  ctx.font = `600 14px ${FONT}`;
  let y = drawLines(ctx, [node.label || "To-do"], r.x + 14, r.y + 12, 22, r.y + r.height);
  ctx.font = `13px ${FONT}`;
  for (const item of checklistItems(node)) {
    if (y + 20 > r.y + r.height) break;
    ctx.strokeStyle = item.done ? DONE : MUTED;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(r.x + 14, y + 2, 12, 12);
    if (item.done) {
      ctx.fillStyle = DONE;
      ctx.fillRect(r.x + 17, y + 5, 6, 6);
    }
    ctx.fillStyle = item.done ? MUTED : TEXT;
    y = drawLines(ctx, wrapText(ctx, item.text, r.width - 50), r.x + 34, y, 18, r.y + r.height) + 4;
  }
}

export function drawImageCard(ctx: CanvasRenderingContext2D, node: DiagramNode, r: Rect, images: Images) {
  cardBox(ctx, r, node, 8);
  const src = imageSrc(node);
  const img = src ? images.get(src) : null;
  const aspect = typeof node.data?.aspect === "number" ? node.data.aspect : 4 / 3;
  const imageRect = { x: r.x, y: r.y, width: r.width, height: Math.min(r.height, r.width / aspect) };
  if (img) drawCover(ctx, img, imageRect, 8);
  if (node.label) {
    ctx.fillStyle = TEXT;
    ctx.font = `13px ${FONT}`;
    drawLines(ctx, wrapText(ctx, node.label, r.width - 24), r.x + 12, imageRect.y + imageRect.height + 8, 18, r.y + r.height);
  }
}


/** A dark panel with the picture over it; a picture the host won't share leaves the panel. */
function drawPanel(ctx: CanvasRenderingContext2D, rect: Rect, radius: number, src: string | undefined, images: Images) {
  ctx.fillStyle = BOARD_BG;
  ctx.beginPath();
  ctx.roundRect(rect.x, rect.y, rect.width, rect.height, radius);
  ctx.fill();
  const img = src ? images.get(src) : null;
  if (img) drawCover(ctx, img, rect, radius);
}

function drawText(ctx: CanvasRenderingContext2D, lines: string[], x: number, y: number, style: { font: string; color: string; lineHeight: number }, maxY: number) {
  ctx.fillStyle = style.color;
  ctx.font = `${style.font} ${FONT}`;
  return drawLines(ctx, lines, x, y, style.lineHeight, maxY);
}

function drawPlayButton(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, fill: string, arrow: string) {
  const s = radius * 0.42;
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = arrow;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.7, cy - s);
  ctx.lineTo(cx + s, cy);
  ctx.lineTo(cx - s * 0.7, cy + s);
  ctx.fill();
}

function drawProviderBadge(ctx: CanvasRenderingContext2D, provider: EmbedProvider, x: number, y: number, maxY: number) {
  ctx.fillStyle = PROVIDER_COLORS[provider];
  ctx.beginPath();
  ctx.arc(x + 4, y + 7, 4, 0, Math.PI * 2);
  ctx.fill();
  drawText(ctx, [PROVIDER_NAMES[provider]], x + 14, y, { font: "11px", color: MUTED, lineHeight: 14 }, maxY);
}

function drawVideoLink(ctx: CanvasRenderingContext2D, link: LinkLook, embed: VideoEmbed, r: Rect, images: Images) {
  const media = { x: r.x, y: r.y, width: r.width, height: Math.max(0, Math.min(r.width / embed.player.aspect, r.height - 64)) };
  drawPanel(ctx, media, 0, link.preview.image ?? embed.thumbnail, images);
  const name = PROVIDER_NAMES[embed.provider];
  ctx.font = `600 11px ${FONT}`;
  ctx.fillStyle = PROVIDER_COLORS[embed.provider];
  ctx.beginPath();
  ctx.roundRect(r.x + 8, r.y + 8, ctx.measureText(name).width + 16, 18, 9);
  ctx.fill();
  drawText(ctx, [name], r.x + 16, r.y + 11, { font: "600 11px", color: BOARD_BG, lineHeight: 14 }, r.y + r.height);
  drawPlayButton(ctx, media.x + media.width / 2, media.y + media.height / 2, 24, PLAY_BG, PLAY_ICON);
  ctx.font = `600 13px ${FONT}`;
  const title = wrapText(ctx, link.title, r.width - 28).slice(0, 2);
  const y = drawText(ctx, title, r.x + 14, media.y + media.height + 10, { font: "600 13px", color: TEXT, lineHeight: 18 }, r.y + r.height);
  drawProviderBadge(ctx, embed.provider, r.x + 14, y + 4, r.y + r.height);
}

function drawSongLink(ctx: CanvasRenderingContext2D, link: LinkLook, embed: AudioEmbed, r: Rect, images: Images) {
  const accent = PROVIDER_COLORS[embed.provider];
  ctx.fillStyle = accent;
  ctx.fillRect(r.x, r.y, 4, r.height);
  const cover = { x: r.x + 16, y: r.y + 12, width: SONG_COVER, height: SONG_COVER };
  drawPanel(ctx, cover, 6, link.preview.image ?? embed.thumbnail, images);
  const textX = cover.x + SONG_COVER + 12;
  const textWidth = r.x + r.width - textX - (embed.player ? 48 : 12);
  const maxY = r.y + r.height;
  ctx.font = `600 13px ${FONT}`;
  const title = wrapText(ctx, link.title, textWidth).slice(0, 2);
  const y = drawText(ctx, title, textX, cover.y + 4, { font: "600 13px", color: TEXT, lineHeight: 18 }, maxY);
  ctx.font = `12px ${FONT}`;
  const subtitle = link.preview.description ? wrapText(ctx, link.preview.description, textWidth).slice(0, 4 - title.length) : [];
  drawText(ctx, subtitle, textX, y + 2, { font: "12px", color: MUTED, lineHeight: 16 }, maxY);
  if (embed.player) drawPlayButton(ctx, r.x + r.width - 30, cover.y + SONG_COVER / 2, 18, accent, BOARD_BG);
  drawProviderBadge(ctx, embed.provider, r.x + 16, cover.y + SONG_COVER + 10, maxY);
}

function drawImageLink(ctx: CanvasRenderingContext2D, link: LinkLook, src: string, r: Rect, images: Images) {
  const media = { x: r.x, y: r.y, width: r.width, height: Math.max(0, r.height - 28) };
  drawPanel(ctx, media, 0, src, images);
  drawText(ctx, [hostname(link.url)], r.x + 14, media.y + media.height + 7, { font: "11px", color: MUTED, lineHeight: 14 }, r.y + r.height);
}

function drawPlainLink(ctx: CanvasRenderingContext2D, link: LinkLook, r: Rect, images: Images) {
  const thumb = { x: r.x + 12, y: r.y + 12, width: LINK_THUMB, height: LINK_THUMB };
  drawPanel(ctx, thumb, 6, link.preview.image, images);
  const textX = thumb.x + LINK_THUMB + 12;
  ctx.font = `600 13px ${FONT}`;
  const title = wrapText(ctx, link.title, r.x + r.width - textX - 12).slice(0, 2);
  const y = drawText(ctx, title, textX, r.y + 12, { font: "600 13px", color: TEXT, lineHeight: 18 }, r.y + r.height);
  const site = link.preview.siteName ? `${link.preview.siteName} · ${hostname(link.url)}` : hostname(link.url);
  drawText(ctx, [site], textX, y + 2, { font: "11px", color: MUTED, lineHeight: 14 }, r.y + r.height);
}

/** Same looks as on screen: a video frame, a song, the picture itself, or a compact link. */
export function drawLink(ctx: CanvasRenderingContext2D, node: DiagramNode, r: Rect, images: Images) {
  cardBox(ctx, r, node);
  const link = linkLook(node);
  const image = link.url ? imageUrlFor(link.url) : null;
  const embed = link.url ? embedFor(link.url) : null;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.width, r.height, 10);
  ctx.clip();
  if (image) drawImageLink(ctx, link, image, r, images);
  else if (embed?.kind === "video") drawVideoLink(ctx, link, embed, r, images);
  else if (embed?.kind === "audio") drawSongLink(ctx, link, embed, r, images);
  else drawPlainLink(ctx, link, r, images);
  ctx.restore();
}

export function drawAssetCard(ctx: CanvasRenderingContext2D, node: DiagramNode, r: Rect, look: AssetLook | null, images: Images) {
  cardBox(ctx, r, node);
  ctx.fillStyle = look?.color ?? MUTED;
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, 5, r.height, [10, 0, 0, 10]);
  ctx.fill();
  const img = look?.thumbnail ? images.get(look.thumbnail) : null;
  let x = r.x + 16;
  if (img) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, x, r.y + (r.height - 36) / 2, 36, 36);
    ctx.imageSmoothingEnabled = true;
    x += 46;
  }
  ctx.fillStyle = look?.color ?? MUTED;
  ctx.font = `11px ${FONT}`;
  drawLines(ctx, [look?.kind ?? "Deleted asset"], x, r.y + 14, 14, r.y + r.height);
  ctx.fillStyle = TEXT;
  ctx.font = `600 14px ${FONT}`;
  drawLines(ctx, [look?.name ?? node.label], x, r.y + 30, 18, r.y + r.height);
}

export function drawTable(ctx: CanvasRenderingContext2D, node: DiagramNode, r: Rect, shape: ShapeDefinition) {
  const color = node.color ?? shape.color;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.width, r.height, 8);
  ctx.fillStyle = CARD_BG;
  ctx.fill();
  ctx.clip();
  ctx.fillStyle = `${color}2e`;
  ctx.fillRect(r.x, r.y, r.width, TABLE_HEADER);
  ctx.restore();
  drawText(ctx, [node.label], r.x + 12, r.y + 11, { font: "600 13px", color: TEXT, lineHeight: 16 }, r.y + r.height);
  const columns = tableColumns(node);
  if (!columns.length) drawText(ctx, ["No columns"], r.x + 12, r.y + TABLE_HEADER + 7, { font: "12px", color: MUTED, lineHeight: 14 }, r.y + r.height);
  columns.forEach((column, i) => {
    const top = r.y + TABLE_HEADER + i * TABLE_ROW;
    ctx.strokeStyle = CARD_BORDER;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(r.x, top);
    ctx.lineTo(r.x + r.width, top);
    ctx.stroke();
    const key = keyLabel(column);
    if (key) drawText(ctx, [key], r.x + 10, top + 8, { font: "700 9px", color: keyColor(column), lineHeight: 12 }, r.y + r.height);
    drawText(ctx, [column.name], r.x + 42, top + 6, { font: column.isPrimaryKey ? "600 12px" : "12px", color: TEXT, lineHeight: 14 }, r.y + r.height);
    ctx.fillStyle = MUTED;
    ctx.font = `11px ${FONT}`;
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.fillText(column.type, r.x + r.width - 10, top + 7);
  });
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.width, r.height, 8);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}
